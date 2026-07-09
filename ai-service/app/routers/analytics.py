import asyncio
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np
import httpx
from app.services.ai_client import complete_json
from app.services.web_search_service import search_web
from app.constants import RESPONDED_STATUSES, INTERVIEW_STATUSES

logger = logging.getLogger(__name__)

router = APIRouter()

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_NOMINATIM_HEADERS = {"User-Agent": "Ostia-App/1.0"}
_NOMINATIM_MIN_INTERVAL = 1.1
_http_client = httpx.AsyncClient(timeout=5, headers=_NOMINATIM_HEADERS)
_nominatim_lock = asyncio.Lock()
_last_nominatim_call = 0.0
_geocode_ai_semaphore = asyncio.Semaphore(3)


class Application(BaseModel):
    status: str
    source: str
    appliedAt: str | None = None
    company: str | None = None


class AnalyticsRequest(BaseModel):
    applications: list[Application]


class GeocodeRequest(BaseModel):
    company: str
    jobTitle: str = ""
    location: str = ""


@router.post("/stats")
def compute_stats(req: AnalyticsRequest):
    if not req.applications:
        return {
            "statusBreakdown": {},
            "sourceBreakdown": {},
            "responseRate": 0,
            "total": 0,
        }

    try:
        df = pd.DataFrame([a.model_dump() for a in req.applications])
    except Exception as e:
        logger.error("Failed to build DataFrame: %s", e)
        raise HTTPException(status_code=400, detail="Invalid application data")

    status_breakdown = df["status"].value_counts().to_dict()
    source_breakdown = df["source"].value_counts().to_dict()

    total = len(df)
    responded = df["status"].isin(RESPONDED_STATUSES).sum()
    response_rate = float(np.round(responded / total * 100, 1))

    interviews = df["status"].isin(INTERVIEW_STATUSES).sum()
    interview_rate = float(np.round(interviews / total * 100, 1))

    timeline: list[dict] = []
    if "appliedAt" in df.columns:
        df["appliedAt"] = pd.to_datetime(df["appliedAt"], errors="coerce")
        valid = df.dropna(subset=["appliedAt"])
        if not valid.empty:
            by_week = (
                valid.groupby(valid["appliedAt"].dt.to_period("W"))
                .size()
                .reset_index(name="count")
            )
            timeline = [
                {"week": str(row["appliedAt"]), "count": int(row["count"])}
                for _, row in by_week.iterrows()
            ]

    return {
        "total": total,
        "statusBreakdown": status_breakdown,
        "sourceBreakdown": source_breakdown,
        "responseRate": response_rate,
        "interviewRate": interview_rate,
        "timeline": timeline,
    }


async def _nominatim_search(query: str) -> dict | None:
    global _last_nominatim_call
    async with _nominatim_lock:
        wait = (
            _last_nominatim_call
            + _NOMINATIM_MIN_INTERVAL
            - asyncio.get_event_loop().time()
        )
        if wait > 0:
            await asyncio.sleep(wait)
        _last_nominatim_call = asyncio.get_event_loop().time()

        try:
            res = await _http_client.get(
                _NOMINATIM_URL,
                params={"q": query, "format": "json", "limit": 1},
            )
            res.raise_for_status()
            data = res.json()
            if data:
                return data[0]
        except httpx.TimeoutException:
            logger.warning("Nominatim timeout for query: %s", query)
        except httpx.HTTPStatusError as e:
            logger.warning(
                "Nominatim HTTP error %s for query: %s", e.response.status_code, query
            )
        except Exception as e:
            logger.error("Nominatim unexpected error: %s", e)
        return None


async def _web_search_geocode(company: str, job_title: str) -> dict | None:
    query = f"{company} {job_title} Lieu"
    logger.info("[web_search] searching: %r", query)
    results = await search_web(query, max_results=3)
    logger.info("[web_search] %d search result(s) for %r", len(results), query)
    if not results:
        return None

    sources = [
        {"url": r["url"], "text": r["text"]} for r in results if r.get("text")
    ]
    logger.info(
        "[web_search] %d/%d result(s) had usable content for %r",
        len(sources),
        len(results),
        query,
    )
    if not sources:
        return None

    blocks = "\n\n".join(
        f'Source {i + 1} ({s["url"]}):\n{s["text"][:1500]}'
        for i, s in enumerate(sources)
    )
    prompt = f"""Given these web pages found while searching for the job "{job_title}" at company "{company}":

{blocks}

Identify the city and country where this job is located, and which Source URL above (if any) is the actual job posting page. Return ONLY a JSON object:
{{"city": "Paris", "country": "France", "jobUrl": "https://exact-source-url"}}

Use one of the exact Source URLs above for "jobUrl", or null if none is a job posting. If the location is unknown, return {{"city": null, "country": null, "jobUrl": null}}"""

    try:
        async with _geocode_ai_semaphore:
            ai_result = await complete_json(prompt, 300)
    except Exception as e:
        logger.warning("[web_search] AI extraction failed for %r: %s", query, e)
        return None
    logger.info("[web_search] AI extraction result for %r: %s", query, ai_result)
    city = ai_result.get("city")
    country = ai_result.get("country")
    if not (city and country):
        logger.info("[web_search] no usable city/country extracted for %r", query)
        return None

    fallback = await _nominatim_search(f"{city}, {country}")
    if not fallback:
        logger.info(
            "[web_search] Nominatim could not resolve %r, %r extracted for %r",
            city,
            country,
            query,
        )
        return None

    job_url = ai_result.get("jobUrl")
    valid_urls = {s["url"] for s in sources}
    return {
        "lat": float(fallback["lat"]),
        "lon": float(fallback["lon"]),
        "resolvedLocation": f"{city}, {country}",
        "jobUrl": job_url if job_url in valid_urls else None,
    }


@router.post("/geocode")
async def geocode(req: GeocodeRequest):
    logger.info(
        "Geocode request: company=%r jobTitle=%r location=%r",
        req.company,
        req.jobTitle,
        req.location,
    )
    if req.location:
        result = await _nominatim_search(req.location)
        if result:
            logger.info("Geocode success via Nominatim for %r", req.location)
            return {
                "lat": float(result["lat"]),
                "lon": float(result["lon"]),
                "resolvedLocation": result.get("display_name", req.location),
                "confidence": "geocoded",
                "jobUrl": None,
            }
    else:
        logger.info(
            "No location text for company=%r, skipping Nominatim (company name is not an address)",
            req.company,
        )

    web_result = await _web_search_geocode(req.company, req.jobTitle)
    if web_result:
        logger.info(
            "Geocode success via web search for company=%r jobTitle=%r -> %s",
            req.company,
            req.jobTitle,
            web_result["resolvedLocation"],
        )
        return {**web_result, "confidence": "web_search"}

    location_hint = (
        f' The recorded location text is "{req.location}" — normalize it into a real city and country if possible.'
        if req.location
        else ""
    )
    prompt = f"""You are a geography expert. Given the company "{req.company}" and job title "{req.jobTitle}", identify the city and country of the company's main office.{location_hint}

Return ONLY a JSON object:
{{"city": "London", "country": "United Kingdom"}}

If unknown, return {{"city": null, "country": null}}"""

    async with _geocode_ai_semaphore:
        ai_result = await complete_json(prompt, 64)
    city = ai_result.get("city")
    country = ai_result.get("country")

    if city and country:
        fallback = await _nominatim_search(f"{city}, {country}")
        if fallback:
            logger.info(
                "Geocode success via AI fallback for company=%r location=%r -> %s, %s",
                req.company,
                req.location,
                city,
                country,
            )
            return {
                "lat": float(fallback["lat"]),
                "lon": float(fallback["lon"]),
                "resolvedLocation": f"{city}, {country}",
                "confidence": "ai_guess",
                "jobUrl": None,
            }

    logger.warning(
        "Geocode failed for company=%r location=%r", req.company, req.location
    )
    return {
        "lat": None,
        "lon": None,
        "resolvedLocation": None,
        "confidence": "failed",
        "jobUrl": None,
    }

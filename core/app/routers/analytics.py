import asyncio
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import pandas as pd
import numpy as np
import httpx
from app.services.ai_client import complete_json
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


@router.post("/geocode")
async def geocode(req: GeocodeRequest):
    query = req.location or req.company

    result = await _nominatim_search(query)
    if result:
        logger.info("Geocode success via Nominatim for %r", query)
        return {
            "lat": float(result["lat"]),
            "lon": float(result["lon"]),
            "resolvedLocation": result.get("display_name", query),
            "confidence": "geocoded",
        }

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
            }

    logger.warning(
        "Geocode failed for company=%r location=%r", req.company, req.location
    )
    return {"lat": None, "lon": None, "resolvedLocation": None, "confidence": "failed"}

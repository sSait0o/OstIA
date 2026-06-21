from fastapi import APIRouter
from pydantic import BaseModel
import pandas as pd
import numpy as np
import httpx
from app.services.ai_client import complete_json

router = APIRouter()


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
        return {"statusBreakdown": {}, "sourceBreakdown": {}, "responseRate": 0, "total": 0}

    df = pd.DataFrame([a.model_dump() for a in req.applications])

    status_breakdown = df["status"].value_counts().to_dict()
    source_breakdown = df["source"].value_counts().to_dict()

    responded_statuses = {"ACKNOWLEDGED", "INTERVIEW", "TECHNICAL", "OFFER", "REJECTED"}
    responded = df["status"].isin(responded_statuses).sum()
    response_rate = float(np.round(responded / len(df) * 100, 1))

    interview_statuses = {"INTERVIEW", "TECHNICAL", "OFFER"}
    interviews = df["status"].isin(interview_statuses).sum()
    interview_rate = float(np.round(interviews / len(df) * 100, 1))

    timeline: list[dict] = []
    if "appliedAt" in df.columns:
        df["appliedAt"] = pd.to_datetime(df["appliedAt"], errors="coerce")
        by_week = (
            df.dropna(subset=["appliedAt"])
            .groupby(df["appliedAt"].dt.to_period("W"))
            .size()
            .reset_index(name="count")
        )
        timeline = [
            {"week": str(row["appliedAt"]), "count": int(row["count"])}
            for _, row in by_week.iterrows()
        ]

    return {
        "total": len(df),
        "statusBreakdown": status_breakdown,
        "sourceBreakdown": source_breakdown,
        "responseRate": response_rate,
        "interviewRate": interview_rate,
        "timeline": timeline,
    }


@router.post("/geocode")
async def geocode(req: GeocodeRequest):
    query = req.location or req.company

    # 1. Nominatim (OpenStreetMap) — no API key needed
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": query, "format": "json", "limit": 1},
                headers={"User-Agent": "Ostia-App/1.0"},
            )
            data = res.json()
            if data:
                return {
                    "lat": float(data[0]["lat"]),
                    "lon": float(data[0]["lon"]),
                    "resolvedLocation": data[0].get("display_name", query),
                    "confidence": "geocoded",
                }
    except Exception:
        pass

    # 2. Fallback — ask Groq to guess the city from company name + job title
    if not req.location:
        prompt = f"""Tu es un expert en géographie des entreprises.
Pour l'entreprise "{req.company}" avec le poste "{req.jobTitle}", devine la ville et le pays du siège social.

Retourne UNIQUEMENT un objet JSON:
{{"city": "Paris", "country": "France"}}

Si tu ne sais vraiment pas, retourne {{"city": null, "country": null}}"""

        result = complete_json(prompt, max_tokens=64)
        city = result.get("city")
        country = result.get("country")

        if city and country:
            try:
                async with httpx.AsyncClient(timeout=5) as client:
                    res = await client.get(
                        "https://nominatim.openstreetmap.org/search",
                        params={"q": f"{city}, {country}", "format": "json", "limit": 1},
                        headers={"User-Agent": "Ostia-App/1.0"},
                    )
                    data = res.json()
                    if data:
                        return {
                            "lat": float(data[0]["lat"]),
                            "lon": float(data[0]["lon"]),
                            "resolvedLocation": f"{city}, {country}",
                            "confidence": "ai_guess",
                        }
            except Exception:
                pass

    return {"lat": None, "lon": None, "resolvedLocation": None, "confidence": "failed"}

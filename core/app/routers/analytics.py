from fastapi import APIRouter
from pydantic import BaseModel
import pandas as pd
import numpy as np

router = APIRouter()


class Application(BaseModel):
    status: str
    source: str
    appliedAt: str | None = None
    company: str | None = None


class AnalyticsRequest(BaseModel):
    applications: list[Application]


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

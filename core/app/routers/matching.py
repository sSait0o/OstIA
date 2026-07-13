from fastapi import APIRouter
from pydantic import BaseModel
from app.services import job_matcher

router = APIRouter()


class ScoreRequest(BaseModel):
    cvData: dict
    jobTitle: str
    jobDescription: str


@router.post("/score")
async def score(req: ScoreRequest):
    return await job_matcher.score_cv_job(req.cvData, req.jobTitle, req.jobDescription)

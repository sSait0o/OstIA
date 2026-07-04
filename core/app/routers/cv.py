import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import cv_parser

logger = logging.getLogger(__name__)
router = APIRouter()


class ParseEmailRequest(BaseModel):
    subject: str
    body: str
    emailId: str


class ExtractCvRequest(BaseModel):
    text: str


class DetectStatusRequest(BaseModel):
    subject: str
    body: str
    company: str
    jobTitle: str
    currentStatus: str


@router.post("/parse-email")
async def parse_email(req: ParseEmailRequest):
    result = await cv_parser.parse_email(req.subject, req.body, req.emailId)
    if result is None:
        raise HTTPException(status_code=400, detail="Not a job application email")
    return result


@router.post("/detect-status")
async def detect_status(req: DetectStatusRequest):
    status = await cv_parser.detect_status_update(
        req.subject,
        req.body,
        req.company,
        req.jobTitle,
        req.currentStatus,
    )
    return {"status": status}


@router.post("/extract")
async def extract_cv(req: ExtractCvRequest):
    return await cv_parser.extract_cv(req.text)

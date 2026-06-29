from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import cv_parser

router = APIRouter()


class ParseEmailRequest(BaseModel):
    subject: str
    body: str
    emailId: str


class ExtractCvRequest(BaseModel):
    text: str


@router.post("/parse-email")
def parse_email(req: ParseEmailRequest):
    result = cv_parser.parse_email(req.subject, req.body, req.emailId)
    if result is None:
        raise HTTPException(status_code=400, detail="Not a job application email")
    return result


@router.post("/extract")
def extract_cv(req: ExtractCvRequest):
    return cv_parser.extract_cv(req.text)

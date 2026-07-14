from typing import Literal

ApplicationStatus = Literal[
    "APPLIED", "ACKNOWLEDGED", "INTERVIEW", "TECHNICAL", "OFFER", "REJECTED"
]

VALID_STATUSES: set[str] = {
    "APPLIED",
    "ACKNOWLEDGED",
    "INTERVIEW",
    "TECHNICAL",
    "OFFER",
    "REJECTED",
}

RESPONDED_STATUSES: set[str] = {"INTERVIEW", "TECHNICAL", "OFFER", "REJECTED"}

INTERVIEW_STATUSES: set[str] = {"INTERVIEW", "TECHNICAL", "OFFER"}

Confidence = Literal["high", "medium", "low"]

VALID_CONFIDENCE_LEVELS: set[str] = {"high", "medium", "low"}

MAX_EMAIL_LENGTH = 4000
MAX_CV_LENGTH = 4000
MAX_JOB_TEXT_LENGTH = 2000

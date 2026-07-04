import logging
import re
from html import unescape
from app.services.ai_client import complete_json
from app.constants import VALID_STATUSES, MAX_EMAIL_LENGTH, MAX_CV_LENGTH

logger = logging.getLogger(__name__)

_RE_STYLE = re.compile(r"<style[^>]*>.*?</style>", re.DOTALL | re.IGNORECASE)
_RE_SCRIPT = re.compile(r"<script[^>]*>.*?</script>", re.DOTALL | re.IGNORECASE)
_RE_TAG = re.compile(r"<[^>]+>")
_RE_WHITESPACE = re.compile(r"\s+")

_SYSTEM_EMAIL = """You are an expert in HR recruitment and email analysis.
You analyze job application emails (internship, apprenticeship, permanent contract, fixed-term).
You are rigorous, precise, and think step by step before answering."""


def _strip_html(text: str) -> str:
    text = _RE_STYLE.sub(" ", text)
    text = _RE_SCRIPT.sub(" ", text)
    text = _RE_TAG.sub(" ", text)
    text = unescape(text)
    return _RE_WHITESPACE.sub(" ", text).strip()


async def parse_email(subject: str, body: str, email_id: str) -> dict | None:
    clean_body = _strip_html(body)[:MAX_EMAIL_LENGTH]

    prompt = f"""Analyze this email related to a job application and return a structured JSON.

SUBJECT: {subject}
CONTENT: {clean_body}

Step 1 - Determine if this is a recruitment/application email:
- YES: application confirmation, HR acknowledgement, interview invitation, technical test, job offer, rejection
- NO: newsletter, password reset, invoice, advertisement, personal email → return {{"not_recruitment": true}}

Step 2 - If YES, return exactly this JSON (no surrounding text):
{{
  "company": "exact company name (never null)",
  "jobTitle": "exact job title (never null, use best guess if unclear)",
  "status": "APPLIED|ACKNOWLEDGED|INTERVIEW|TECHNICAL|OFFER|REJECTED",
  "location": "city/country or null",
  "appliedAt": "ISO 8601 date or null",
  "notes": "factual 1-sentence summary"
}}

Status definitions:
- APPLIED: you sent an application, platform confirmation (LinkedIn, Indeed, Welcometothejungle...)
- ACKNOWLEDGED: automatic receipt from the company ("we have received your application")
- INTERVIEW: invitation to an interview (phone, video, in-person)
- TECHNICAL: invitation to a technical test, case study, assessment
- OFFER: job offer, contract proposal
- REJECTED: explicit rejection of the application

Company examples: "BNP Paribas", "Thales", "Capgemini" (not "HR team of BNP", not "the recruitment team")
JobTitle examples: "Full Stack Developer", "Data Analyst", "IT Project Manager Apprenticeship" """

    result = await complete_json(prompt, max_tokens=400, system=_SYSTEM_EMAIL)

    if not result or result.get("not_recruitment"):
        return None

    company = result.get("company")
    job_title = result.get("jobTitle")

    if not company and not job_title:
        logger.info("Email %s discarded: no company or jobTitle found", email_id)
        return None

    status = result.get("status", "APPLIED")
    if status not in VALID_STATUSES:
        logger.warning(
            "Email %s discarded: invalid status '%s' from AI", email_id, status
        )
        return None

    return {
        "company": company or "Unknown",
        "jobTitle": job_title or "Unknown",
        "status": status,
        "location": result.get("location"),
        "appliedAt": result.get("appliedAt"),
        "notes": result.get("notes"),
        "emailId": email_id,
        "source": "EMAIL",
    }


async def detect_status_update(
    subject: str, body: str, company: str, job_title: str, current_status: str
) -> str | None:
    clean_body = _strip_html(body)[:MAX_EMAIL_LENGTH]

    prompt = f"""This email is a follow-up in an ongoing job application to "{company}" for the position "{job_title}".
Current tracked status: {current_status}

SUBJECT: {subject}
CONTENT: {clean_body}

Does this email clearly indicate a NEW status for this application? Reply with exactly this JSON (no surrounding text):
{{"status": "APPLIED" | "ACKNOWLEDGED" | "INTERVIEW" | "TECHNICAL" | "OFFER" | "REJECTED" | null}}

Return null if the email does not clearly indicate one of these statuses (e.g. a scheduling detail, a generic reply, an out-of-office)."""

    result = await complete_json(prompt, max_tokens=60, system=_SYSTEM_EMAIL)
    status = result.get("status") if result else None
    return status if status in VALID_STATUSES else None


async def extract_cv(text: str) -> dict:
    if len(text) > MAX_CV_LENGTH:
        logger.warning(
            "CV text truncated from %d to %d characters", len(text), MAX_CV_LENGTH
        )

    prompt = f"""Analyze this CV and extract structured information.

CV:
{text[:MAX_CV_LENGTH]}

Return ONLY a valid JSON object:
{{
  "firstName": "",
  "lastName": "",
  "email": "",
  "phone": "",
  "skills": ["skill1"],
  "languages": ["language1"],
  "experience": [{{"title": "", "company": "", "duration": "", "description": ""}}],
  "education": [{{"degree": "", "school": "", "year": ""}}],
  "summary": "profile summary"
}}"""

    return await complete_json(prompt, max_tokens=1024)

import json
import logging
import re
import unicodedata
from fastapi import HTTPException
from app.services.ai_client import complete_json
from app.constants import MAX_JOB_TEXT_LENGTH

logger = logging.getLogger(__name__)

_MAX_TEXT_LENGTH = MAX_JOB_TEXT_LENGTH


def _strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(c for c in normalized if not unicodedata.combining(c))


def _keyword_overlap_score(cv_skills: list[str], job_description: str) -> float:
    if not cv_skills:
        return 0.0
    desc_normalized = _strip_accents(job_description.lower())
    matches = sum(
        1
        for skill in cv_skills
        if re.search(
            r"\b" + re.escape(_strip_accents(skill.lower())) + r"\b", desc_normalized
        )
    )
    return round(matches / len(cv_skills) * 100, 1)


def _sanitize_skill_list(value) -> list[str]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str)]
    return []


def _cv_summary(cv_data: dict) -> str:
    relevant = {
        k: cv_data[k]
        for k in (
            "firstName",
            "lastName",
            "skills",
            "experience",
            "education",
            "summary",
        )
        if k in cv_data
    }
    text = json.dumps(relevant, ensure_ascii=False)
    return text[:_MAX_TEXT_LENGTH]


async def score_cv_job(cv_data: dict, job_title: str, job_description: str) -> dict:
    cv_skills: list[str] = cv_data.get("skills", [])
    preliminary = _keyword_overlap_score(cv_skills, job_description)

    prompt = f"""You are an expert technical recruiter. Evaluate the match between this candidate and the job offer.

Think step by step:
1. List the key skills required by the job description.
2. Cross-reference with the candidate's skills and experience.
3. Identify matched and missing skills.
4. Assign a final compatibility score (0-100).

Candidate profile:
{_cv_summary(cv_data)}

Job title: {job_title}
Job description:
{job_description[:_MAX_TEXT_LENGTH]}

Keyword-based preliminary score: {preliminary}/100

Return ONLY a valid JSON object:
{{
  "score": 0-100,
  "matchedSkills": ["skill1"],
  "missingSkills": ["missing1"],
  "summary": "1-2 sentence compatibility summary"
}}"""

    try:
        result = await complete_json(prompt, max_tokens=1024)
    except HTTPException:
        result = None

    if not result or "score" not in result:
        logger.warning(
            "AI matching returned no usable result, falling back to keyword score"
        )
        return {
            "score": round(preliminary),
            "matchedSkills": cv_skills,
            "missingSkills": [],
            "summary": "Score based on keyword overlap only.",
        }

    score = result.get("score")
    if not isinstance(score, (int, float)) or not (0 <= score <= 100):
        result["score"] = round(preliminary)
        score = result["score"]

    matched = _sanitize_skill_list(result.get("matchedSkills"))
    result["matchedSkills"] = matched
    result["missingSkills"] = _sanitize_skill_list(result.get("missingSkills"))

    if cv_skills and not matched and score > 0:
        logger.warning(
            "AI matching score=%s inconsistent with empty matchedSkills, "
            "falling back to keyword score",
            score,
        )
        result["score"] = round(preliminary)

    return result

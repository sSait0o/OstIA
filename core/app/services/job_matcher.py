import numpy as np
from app.services.ai_client import complete_json


def _keyword_overlap_score(cv_skills: list[str], job_description: str) -> float:
    """Fast NumPy-based keyword overlap as a preliminary score."""
    if not cv_skills:
        return 0.0
    desc_lower = job_description.lower()
    matches = np.array([1 if skill.lower() in desc_lower else 0 for skill in cv_skills])
    return float(np.sum(matches) / len(matches) * 100)


def score_cv_job(cv_data: dict, job_title: str, job_description: str) -> dict:
    cv_skills: list[str] = cv_data.get("skills", [])
    preliminary = _keyword_overlap_score(cv_skills, job_description)

    cv_summary = str(cv_data)[:2000]

    prompt = f"""Tu es un expert en recrutement tech. Évalue la compatibilité entre ce CV et cette offre.

CV:
{cv_summary}

Offre: {job_title}
Description: {job_description[:2000]}

Score préliminaire basé sur les mots-clés: {preliminary:.0f}/100

Retourne UNIQUEMENT un objet JSON valide:
{{
  "score": 0-100,
  "matchedSkills": ["compétence1"],
  "missingSkills": ["compétence manquante1"],
  "summary": "résumé compatibilité en 1-2 phrases"
}}"""

    result = complete_json(prompt, max_tokens=512)
    if not result:
        return {
            "score": round(preliminary),
            "matchedSkills": cv_skills,
            "missingSkills": [],
            "summary": "Analyse basée sur correspondance de mots-clés.",
        }
    return result

from app.services.ai_client import complete_json


def parse_email(subject: str, body: str, email_id: str) -> dict | None:
    prompt = f"""Tu es un assistant qui analyse des emails de recrutement en français et en anglais.
Analyse cet email et extrais les informations de candidature.

Sujet: {subject}
Corps: {body[:3000]}

Retourne UNIQUEMENT un objet JSON valide (null si l'email n'est pas lié à une candidature):
{{
  "company": "nom de l'entreprise",
  "jobTitle": "intitulé du poste",
  "status": "APPLIED|ACKNOWLEDGED|INTERVIEW|TECHNICAL|OFFER|REJECTED",
  "appliedAt": "date ISO 8601 ou null",
  "notes": "résumé en 1 phrase"
}}

Règles statut: APPLIED=envoi confirmé, ACKNOWLEDGED=accusé réception, INTERVIEW=invitation entretien, TECHNICAL=test technique, OFFER=offre, REJECTED=refus"""

    result = complete_json(prompt, max_tokens=512)
    if not result or not result.get("company") or not result.get("jobTitle"):
        return None
    return {**result, "emailId": email_id, "source": "EMAIL"}


def extract_cv(text: str) -> dict:
    prompt = f"""Analyse ce CV et extrais les informations structurées.

CV:
{text[:4000]}

Retourne UNIQUEMENT un objet JSON valide:
{{
  "firstName": "",
  "lastName": "",
  "email": "",
  "skills": ["compétence1"],
  "languages": ["langue1"],
  "experience": [{{"title": "", "company": "", "duration": "", "description": ""}}],
  "education": [{{"degree": "", "school": "", "year": ""}}],
  "summary": "résumé du profil"
}}"""

    return complete_json(prompt, max_tokens=1024)

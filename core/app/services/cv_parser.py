import re
from app.services.ai_client import complete, complete_json

_SYSTEM_EMAIL = """Tu es un expert en recrutement et en analyse d'emails RH.
Tu analyses des emails liés aux candidatures d'emploi (alternance, stage, CDI, CDD).
Tu es rigoureux, précis, et tu réfléchis étape par étape avant de répondre."""


def _strip_html(text: str) -> str:
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL)
    text = re.sub(r"<script[^>]*>.*?</script>", " ", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&[a-z]+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def parse_email(subject: str, body: str, email_id: str) -> dict | None:
    clean_body = _strip_html(body)[:4000]

    prompt = f"""Analyse cet email lié à une candidature d'emploi et retourne un JSON structuré.

SUJET: {subject}
CONTENU: {clean_body}

Règle 1 — Détermine si c'est un email de recrutement/candidature :
- OUI : confirmation de candidature, accusé de réception RH, invitation entretien, test technique, offre d'embauche, refus
- NON : newsletter, réinitialisation mot de passe, facture, publicité, email personnel → retourne {{"not_recruitment": true}}

Règle 2 — Si OUI, retourne exactement ce JSON (sans texte autour) :
{{
  "company": "nom exact de l'entreprise (jamais null)",
  "jobTitle": "intitulé exact du poste (jamais null)",
  "status": "APPLIED|ACKNOWLEDGED|INTERVIEW|TECHNICAL|OFFER|REJECTED",
  "location": "ville/pays ou null",
  "appliedAt": "date ISO 8601 ou null",
  "notes": "résumé factuel en 1 phrase"
}}

Statuts — choisis le plus précis :
- APPLIED : tu as envoyé une candidature, confirmation d'envoi sur une plateforme (LinkedIn, Indeed, Welcometothejungle...)
- ACKNOWLEDGED : accusé de réception automatique de l'entreprise ("nous avons bien reçu votre candidature")
- INTERVIEW : invitation à un entretien (téléphonique, visio, présentiel)
- TECHNICAL : invitation à un test technique, cas pratique, assessment
- OFFER : offre d'embauche, proposition de contrat
- REJECTED : refus explicite de la candidature

Exemples de company : "BNP Paribas", "Thales", "Capgemini" (pas "RH de BNP", pas "l'équipe recrutement")
Exemples de jobTitle : "Développeur Full Stack", "Data Analyst", "Alternance Chef de Projet IT" """

    result = complete_json(prompt, max_tokens=400, system=_SYSTEM_EMAIL)

    if not result or result.get("not_recruitment") or not result.get("company") or not result.get("jobTitle"):
        return None

    valid_statuses = {"APPLIED", "ACKNOWLEDGED", "INTERVIEW", "TECHNICAL", "OFFER", "REJECTED"}
    status = result.get("status", "APPLIED")
    if status not in valid_statuses:
        status = "APPLIED"

    return {
        "company": result.get("company"),
        "jobTitle": result.get("jobTitle"),
        "status": status,
        "location": result.get("location"),
        "appliedAt": result.get("appliedAt"),
        "notes": result.get("notes"),
        "emailId": email_id,
        "source": "EMAIL",
    }


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

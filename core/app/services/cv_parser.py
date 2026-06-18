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

    # Étape 1 : raisonnement libre pour comprendre l'email
    analysis_prompt = f"""Analyse cet email lié à une candidature professionnelle.

SUJET: {subject}
CONTENU: {clean_body}

Réponds en français en expliquant :
1. Est-ce un email de candidature/recrutement ? (oui/non et pourquoi)
2. Quelle entreprise a envoyé ou est concernée ?
3. Quel poste/intitulé est mentionné ?
4. Quel est le statut : envoi confirmé, accusé de réception, invitation entretien, test technique, offre d'emploi, ou refus ?
5. Y a-t-il une ville ou localisation mentionnée (ex: Paris, Lyon, télétravail, remote) ?
6. Y a-t-il une date mentionnée ?
7. Points importants à retenir ?"""

    analysis = complete(analysis_prompt, max_tokens=600, system=_SYSTEM_EMAIL)

    if not analysis:
        return None

    # Étape 2 : extraction JSON basée sur l'analyse
    extract_prompt = f"""Sur la base de cette analyse d'email de recrutement :

{analysis}

Retourne UNIQUEMENT un objet JSON valide (ou null si ce n'est pas un email de candidature) :
{{
  "company": "nom exact de l'entreprise (null si inconnu)",
  "jobTitle": "intitulé précis du poste (null si inconnu)",
  "status": "APPLIED|INTERVIEW|OFFER|REJECTED",
  "location": "ville ou région du poste (ex: Paris, Lyon, Remote, Île-de-France) ou null",
  "appliedAt": "date ISO 8601 si mentionnée ou null",
  "notes": "résumé factuel en 1 phrase de l'email"
}}

Règles de statut :
- APPLIED : confirmation d'envoi OU accusé de réception de la candidature (les deux sont le même stade)
- INTERVIEW : invitation à un entretien (téléphonique, visio, présentiel)
- OFFER : offre d'embauche reçue
- REJECTED : refus explicite de la candidature

Si ce n'est pas un email de recrutement, retourne null."""

    result = complete_json(extract_prompt, max_tokens=400, system=_SYSTEM_EMAIL)

    if not result or not result.get("company") or not result.get("jobTitle"):
        return None

    return {
        "company": result.get("company"),
        "jobTitle": result.get("jobTitle"),
        "status": result.get("status", "ACKNOWLEDGED"),
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

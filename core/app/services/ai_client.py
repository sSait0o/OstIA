import json
import re
from groq import Groq
from app.config import settings

_client = Groq(api_key=settings.groq_api_key)
_MODEL = "llama-3.3-70b-versatile"


def complete(prompt: str, max_tokens: int = 1024) -> str:
    response = _client.chat.completions.create(
        model=_MODEL,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.choices[0].message.content or ""


def complete_json(prompt: str, max_tokens: int = 1024) -> dict:
    text = complete(prompt, max_tokens)
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return {}
    return json.loads(match.group())

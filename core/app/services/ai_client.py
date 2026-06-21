import json
import re
from groq import Groq
from app.config import settings

_client = Groq(api_key=settings.groq_api_key)
_MODEL = "llama-3.3-70b-versatile"


def complete(prompt: str, max_tokens: int = 1024, system: str | None = None) -> str:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    response = _client.chat.completions.create(
        model=_MODEL,
        max_tokens=max_tokens,
        messages=messages,
        temperature=0.1,
    )
    return response.choices[0].message.content or ""


def complete_json(prompt: str, max_tokens: int = 1024, system: str | None = None) -> dict:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    response = _client.chat.completions.create(
        model=_MODEL,
        max_tokens=max_tokens,
        messages=messages,
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    text = response.choices[0].message.content or "{}"
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return {}
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            return {}

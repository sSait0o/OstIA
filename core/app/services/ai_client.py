import json
import logging
import time
import requests
import certifi
from fastapi import HTTPException
from app.config import settings

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_RETRY_DELAY = 2.0
_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


def _build_messages(prompt: str, system: str | None) -> list[dict]:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return messages


def _call_groq(messages: list[dict], max_tokens: int, response_format: dict | None = None) -> dict:
    payload: dict = {
        "model": settings.groq_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.1,
    }
    if response_format:
        payload["response_format"] = response_format

    for attempt in range(_MAX_RETRIES):
        try:
            resp = requests.post(
                _GROQ_URL,
                headers={"Authorization": f"Bearer {settings.groq_api_key}"},
                json=payload,
                verify=certifi.where(),
                timeout=30,
            )
            if resp.status_code == 429:
                logger.warning("Groq rate limit hit, attempt %d/%d", attempt + 1, _MAX_RETRIES)
                if attempt < _MAX_RETRIES - 1:
                    time.sleep(_RETRY_DELAY * (attempt + 1))
                continue
            resp.raise_for_status()
            return resp.json()
        except requests.ConnectionError as e:
            logger.error("Groq connection error: %s", e)
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAY)
        except requests.HTTPError as e:
            logger.error("Groq HTTP error: %s", e)
            raise HTTPException(status_code=503, detail="AI service unavailable")
        except requests.Timeout:
            logger.error("Groq timeout on attempt %d", attempt + 1)
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAY)

    raise HTTPException(status_code=503, detail="AI service unavailable after retries")


def complete(prompt: str, max_tokens: int = 1024, system: str | None = None) -> str:
    messages = _build_messages(prompt, system)
    result = _call_groq(messages, max_tokens)
    return result["choices"][0]["message"]["content"] or ""


def complete_json(prompt: str, max_tokens: int = 1024, system: str | None = None) -> dict:
    messages = _build_messages(prompt, system)
    for attempt in range(_MAX_RETRIES):
        try:
            result = _call_groq(messages, max_tokens, response_format={"type": "json_object"})
            text = result["choices"][0]["message"]["content"] or "{}"
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning("Invalid JSON from Groq on attempt %d, retrying", attempt + 1)
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAY)
    logger.error("complete_json failed after %d attempts", _MAX_RETRIES)
    return {}

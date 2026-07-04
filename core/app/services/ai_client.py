import json
import logging
import time
from groq import Groq, APIError, APIConnectionError, RateLimitError
from fastapi import HTTPException
from app.config import settings

logger = logging.getLogger(__name__)

_client = Groq(api_key=settings.groq_api_key)
_MAX_RETRIES = 3
_RETRY_DELAY = 2.0
_MAX_RATE_LIMIT_WAIT = 8.0


def _build_messages(prompt: str, system: str | None) -> list[dict]:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return messages


def _rate_limit_wait(error: RateLimitError, attempt: int) -> float:
    header = error.response.headers.get("retry-after")
    if header:
        try:
            return min(max(float(header), 0.5), _MAX_RATE_LIMIT_WAIT)
        except ValueError:
            pass
    return min(_RETRY_DELAY * (attempt + 1), _MAX_RATE_LIMIT_WAIT)


def complete(prompt: str, max_tokens: int = 1024, system: str | None = None) -> str:
    messages = _build_messages(prompt, system)
    for attempt in range(_MAX_RETRIES):
        try:
            response = _client.chat.completions.create(
                model=settings.groq_model,
                max_tokens=max_tokens,
                messages=messages,
                temperature=0.1,
            )
            return response.choices[0].message.content or ""
        except RateLimitError as e:
            wait = _rate_limit_wait(e, attempt)
            logger.warning(
                "Groq rate limit hit, attempt %d/%d, waiting %.1fs",
                attempt + 1, _MAX_RETRIES, wait,
            )
            if attempt < _MAX_RETRIES - 1:
                time.sleep(wait)
        except APIConnectionError as e:
            logger.error("Groq connection error: %s", e)
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAY)
        except APIError as e:
            logger.error("Groq API error: %s", e)
            raise HTTPException(status_code=503, detail="AI service unavailable")
    raise HTTPException(status_code=503, detail="AI service unavailable after retries")


def complete_json(prompt: str, max_tokens: int = 1024, system: str | None = None) -> dict:
    messages = _build_messages(prompt, system)
    last_error: Exception | None = None
    for attempt in range(_MAX_RETRIES):
        try:
            response = _client.chat.completions.create(
                model=settings.groq_model,
                max_tokens=max_tokens,
                messages=messages,
                temperature=0.1,
                response_format={"type": "json_object"},
            )
            text = response.choices[0].message.content or "{}"
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning("Invalid JSON from Groq on attempt %d, retrying", attempt + 1)
            last_error = e
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAY)
        except RateLimitError as e:
            wait = _rate_limit_wait(e, attempt)
            logger.warning(
                "Groq rate limit hit, attempt %d/%d, waiting %.1fs",
                attempt + 1, _MAX_RETRIES, wait,
            )
            last_error = e
            if attempt < _MAX_RETRIES - 1:
                time.sleep(wait)
        except APIConnectionError as e:
            logger.error("Groq connection error: %s", e)
            last_error = e
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_DELAY)
        except APIError as e:
            logger.error("Groq API error: %s", e)
            raise HTTPException(status_code=503, detail="AI service unavailable")
    logger.error("complete_json failed after %d attempts", _MAX_RETRIES)
    if isinstance(last_error, (RateLimitError, APIConnectionError)):
        raise HTTPException(status_code=503, detail="AI service unavailable after retries")
    return {}

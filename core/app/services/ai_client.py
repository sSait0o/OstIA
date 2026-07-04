import json
import logging
import asyncio
import ssl
import certifi
import aiohttp
from fastapi import HTTPException
from app.config import settings

logger = logging.getLogger(__name__)

_MAX_RETRIES = 3
_RETRY_DELAY = 2.0
_MAX_RATE_LIMIT_WAIT = 8.0
_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_SSL_CTX = ssl.create_default_context(cafile=certifi.where())


def _build_messages(prompt: str, system: str | None) -> list[dict]:
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    return messages


def _rate_limit_wait(resp: aiohttp.ClientResponse, attempt: int) -> float:
    header = resp.headers.get("retry-after")
    if header:
        try:
            return min(max(float(header), 0.5), _MAX_RATE_LIMIT_WAIT)
        except ValueError:
            pass
    return min(_RETRY_DELAY * (attempt + 1), _MAX_RATE_LIMIT_WAIT)


async def _call_groq(
    messages: list[dict], max_tokens: int, response_format: dict | None = None
) -> dict:
    payload: dict = {
        "model": settings.groq_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": 0.1,
    }
    if response_format:
        payload["response_format"] = response_format

    headers = {"Authorization": f"Bearer {settings.groq_api_key.strip()}"}

    for attempt in range(_MAX_RETRIES):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    _GROQ_URL,
                    headers=headers,
                    json=payload,
                    ssl=_SSL_CTX,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status == 429:
                        wait = _rate_limit_wait(resp, attempt)
                        logger.warning(
                            "Groq rate limit hit, attempt %d/%d, waiting %.1fs",
                            attempt + 1,
                            _MAX_RETRIES,
                            wait,
                        )
                        if attempt < _MAX_RETRIES - 1:
                            await asyncio.sleep(wait)
                        continue
                    if resp.status >= 400:
                        text = await resp.text()
                        logger.error("Groq HTTP error %d: %s", resp.status, text)
                        raise HTTPException(
                            status_code=503, detail="AI service unavailable"
                        )
                    return await resp.json()
        except aiohttp.ClientConnectionError as e:
            logger.error("Groq connection error: %s", e)
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(_RETRY_DELAY)
        except asyncio.TimeoutError:
            logger.error("Groq timeout on attempt %d", attempt + 1)
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(_RETRY_DELAY)

    raise HTTPException(status_code=503, detail="AI service unavailable after retries")


async def complete(
    prompt: str, max_tokens: int = 1024, system: str | None = None
) -> str:
    messages = _build_messages(prompt, system)
    result = await _call_groq(messages, max_tokens)
    return result["choices"][0]["message"]["content"] or ""


async def complete_json(
    prompt: str, max_tokens: int = 1024, system: str | None = None
) -> dict:
    messages = _build_messages(prompt, system)
    for attempt in range(_MAX_RETRIES):
        try:
            result = await _call_groq(
                messages, max_tokens, response_format={"type": "json_object"}
            )
            text = result["choices"][0]["message"]["content"] or "{}"
            return json.loads(text)
        except json.JSONDecodeError:
            logger.warning(
                "Invalid JSON from Groq on attempt %d, retrying", attempt + 1
            )
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(_RETRY_DELAY)
    logger.error("complete_json failed after %d attempts", _MAX_RETRIES)
    return {}

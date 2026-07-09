import json
import logging
import asyncio
import ssl
import time
import certifi
import aiohttp
from fastapi import HTTPException
from app.config import settings

logger = logging.getLogger(__name__)

_RETRY_DELAY = 2.0
_MAX_RATE_LIMIT_WAIT = 8.0
_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_SSL_CTX = ssl.create_default_context(cafile=certifi.where())


def _load_key_pool() -> list[str]:
    raw = settings.groq_api_keys or settings.groq_api_key
    return [k.strip() for k in raw.split(",") if k.strip()]


_KEY_POOL = _load_key_pool()
_MAX_RETRIES = max(3, len(_KEY_POOL) + 1)
_key_cooldowns: dict[str, float] = {}
_key_cursor = 0
_pool_lock = asyncio.Lock()


async def _pick_key() -> str:
    global _key_cursor
    if not _KEY_POOL:
        return ""
    async with _pool_lock:
        now = time.monotonic()
        for _ in range(len(_KEY_POOL)):
            key = _KEY_POOL[_key_cursor % len(_KEY_POOL)]
            _key_cursor += 1
            if _key_cooldowns.get(key, 0.0) <= now:
                return key
        return min(_KEY_POOL, key=lambda k: _key_cooldowns.get(k, 0.0))


async def _mark_cooldown(key: str, wait: float) -> None:
    if not key:
        return
    async with _pool_lock:
        _key_cooldowns[key] = time.monotonic() + wait


async def _seconds_until_any_key_free() -> float | None:
    if not _KEY_POOL:
        return None
    async with _pool_lock:
        now = time.monotonic()
        remaining = [_key_cooldowns.get(k, 0.0) - now for k in _KEY_POOL]
        if all(r > 0 for r in remaining):
            return max(0.0, min(remaining))
        return None


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
        "reasoning_effort": "low",
    }
    if response_format:
        payload["response_format"] = response_format

    last_error: str | None = None

    for attempt in range(_MAX_RETRIES):
        key = await _pick_key()
        headers = {"Authorization": f"Bearer {key}"}
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
                        await _mark_cooldown(key, wait)
                        logger.warning(
                            "Groq rate limit hit on key ...%s, attempt %d/%d, cooling down %.1fs",
                            key[-4:],
                            attempt + 1,
                            _MAX_RETRIES,
                            wait,
                        )
                        last_error = "429 rate limited"
                        if attempt < _MAX_RETRIES - 1:
                            still_wait = await _seconds_until_any_key_free()
                            if still_wait is not None:
                                await asyncio.sleep(still_wait)
                        continue
                    if resp.status >= 400:
                        text = await resp.text()
                        logger.error(
                            "Groq HTTP error %d on key ...%s, attempt %d/%d: %s",
                            resp.status,
                            key[-4:],
                            attempt + 1,
                            _MAX_RETRIES,
                            text,
                        )
                        last_error = f"{resp.status}: {text}"
                        await _mark_cooldown(key, _RETRY_DELAY)
                        continue
                    return await resp.json()
        except aiohttp.ClientConnectionError as e:
            logger.error("Groq connection error: %s", e)
            last_error = str(e)
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(_RETRY_DELAY)
        except asyncio.TimeoutError:
            logger.error("Groq timeout on attempt %d", attempt + 1)
            last_error = "timeout"
            if attempt < _MAX_RETRIES - 1:
                await asyncio.sleep(_RETRY_DELAY)

    raise HTTPException(
        status_code=503,
        detail=f"AI service unavailable after retries: {last_error}",
    )


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

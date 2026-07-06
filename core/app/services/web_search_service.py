import logging

import httpx
from bs4 import BeautifulSoup

from app.config import settings

logger = logging.getLogger(__name__)

_TAVILY_URL = "https://api.tavily.com/search"
_http_client = httpx.AsyncClient(timeout=10)


def _clean_text(raw: str, max_chars: int = 4000) -> str:
    soup = BeautifulSoup(raw, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    text = " ".join(soup.get_text(separator=" ").split())
    return text[:max_chars]


async def search_web(query: str, max_results: int = 3) -> list[dict]:
    if not settings.tavily_api_key:
        logger.warning("TAVILY_API_KEY not configured, skipping web search")
        return []

    try:
        res = await _http_client.post(
            _TAVILY_URL,
            headers={"Authorization": f"Bearer {settings.tavily_api_key}"},
            json={
                "query": query,
                "max_results": max_results,
                "include_raw_content": "text",
                "search_depth": "basic",
            },
        )
        res.raise_for_status()
        data = res.json()
    except Exception as e:
        logger.warning("Tavily search failed for query %r: %s", query, e)
        return []

    results = []
    for r in data.get("results", []):
        raw_text = r.get("raw_content") or r.get("content") or ""
        results.append(
            {
                "url": r.get("url", ""),
                "title": r.get("title", ""),
                "text": _clean_text(raw_text) if raw_text else "",
            }
        )
    return results

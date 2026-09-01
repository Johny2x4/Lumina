import re
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
import httpx

from ..auth import verify_lumina_token
from ..config import OLLAMA_BASE_URL, SEARXNG_URL

router = APIRouter(tags=["search"], dependencies=[Depends(verify_lumina_token)])


def clean_search_query(text: str) -> str:
    """Normalize conversational prompts into focused search engine queries."""
    if not text:
        return ""
    # Normalize unicode curly apostrophes and quotes
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')

    # 1. WEATHER & FORECAST INTENT
    weather_terms = r"\b(?:weather|forecast|temperature|temp|rain|raining|snow|snowing|sunny|precipitation|storm)\b"
    if re.search(weather_terms, text, re.IGNORECASE):
        # Check for zip/postal code (e.g., "zip code 68046", "in 68046", "zip 90210")
        zip_match = re.search(r"\b(?:zip(?:\s*code)?|postal(?:\s*code)?\s*)?\s*(\d{5}(?:-\d{4})?)\b", text, re.IGNORECASE)
        # Check for timeframe
        time_match = re.search(r"\b(today|tomorrow|this weekend|tonight|next week|weekly|hourly|currently|right now)\b", text, re.IGNORECASE)
        time_frame = time_match.group(1).lower() if time_match else ""
        if time_frame in ("currently", "right now"):
            time_frame = ""

        if zip_match:
            zip_code = zip_match.group(1)
            return f"weather {zip_code}"

        # Named location weather (e.g. "weather in Omaha, NE tomorrow", "forecast for Paris France")
        loc_match = re.search(
            r"(?:" + weather_terms + r").*?\b(?:in|for|at|around)\s+([a-zA-Z0-9\s,.-]+?)(?:\s+(?:today|tomorrow|this\s+weekend|tonight|next\s+week))?(?:[?!.]|$)",
            text,
            re.IGNORECASE,
        )
        if loc_match:
            loc = loc_match.group(1).strip()
            loc = re.sub(r"\b(?:zip(?:\s*code)?|postal(?:\s*code)?)\b", "", loc, flags=re.IGNORECASE).strip()
            loc = re.sub(r"\b(today|tomorrow|this weekend|tonight)\b", "", loc, flags=re.IGNORECASE).strip()
            loc = re.sub(r"[?!.,;:\"]", "", loc).strip()
            if loc and len(loc) > 1:
                return f"weather {loc}"

    # 2. EVENTS / ACTIVITIES INTENT
    event_match = re.search(
        r"\b(?:events?|things\s+to\s+do|festivals?|concerts?|activities|what\s+to\s+do)\b.*?\b(?:in|at|around)\s+([a-zA-Z0-9\s,.-]+?)(?:\s+(?:in|during|for|this|next)\s+([a-zA-Z0-9\s]+))?(?:[?!.]|$)",
        text,
        re.IGNORECASE,
    )
    if event_match:
        loc = re.sub(r"[?!.,;:\"]", "", event_match.group(1)).strip()
        time_frame = re.sub(r"[?!.,;:\"]", "", event_match.group(2) or "").strip()
        if loc:
            parts = [loc, "events"]
            if time_frame:
                parts.append(time_frame)
            return " ".join(parts)

    # 3. STOCK / CRYPTO / PRICE INTENT
    price_match = re.search(
        r"\b(?:price|stock\s+price|market\s+cap|trading\s+at|how\s+much\s+is|cost\s+of)\b.*?\b(?:of|for)?\s*([a-zA-Z0-9\s.-]+?)(?:\s+(?:today|right\s+now|currently))?(?:[?!.]|$)",
        text,
        re.IGNORECASE,
    )
    if price_match and any(w in text.lower() for w in ["stock", "shares", "crypto", "bitcoin", "coin", "usd", "price"]):
        asset = re.sub(r"[?!.,;:\"]", "", price_match.group(1)).strip()
        asset = re.sub(r"\b(?:how much is|price of|stock price of|trading at|currently|today)\b", "", asset, flags=re.IGNORECASE).strip()
        asset = re.sub(r"^(?:of|for)\s+", "", asset, flags=re.IGNORECASE).strip()
        if asset:
            return f"{asset} price"

    # 4. GENERAL CONVERSATIONAL CLEANING
    prefixes = [
        r"^(?:what(?:'s|\s+is|\s+are)?|which|tell\s+me\s+about|can\s+you\s+(?:tell\s+me|find|search|show\s+me)|how(?:\s+is|'s)|search\s+(?:for)?|find\s+(?:out)?|who\s+(?:is|was|were)|where\s+(?:is|are)|please\s+tell\s+me|give\s+me\s+(?:the)?|show\s+me|do\s+you\s+know)\s+(?:the\s+|a\s+|an\s+|some\s+)?",
    ]
    for p in prefixes:
        text = re.sub(p, "", text, flags=re.IGNORECASE).strip()

    fillers = [
        r"\bsupposed\s+to\s+be\s+like\b",
        r"\bgoing\s+to\s+be\s+like\b",
        r"\blooks?\s+like\b",
        r"\blike\s+today\s+in\b",
        r"\bare\s+happening\s+in\b",
        r"\bhappening\s+in\b",
        r"\bgoing\s+on\s+in\b",
        r"\btaking\s+place\s+in\b",
        r"\bare\s+there\s+in\b",
        r"\bcan\s+you\s+tell\s+me\b",
        r"\bi\s+want\s+to\s+know\b",
    ]
    for f in fillers:
        text = re.sub(f, "", text, flags=re.IGNORECASE).strip()

    text = re.sub(r"^(?:big|cool|fun|major|popular|best|top|upcoming|great)\s+", "", text, flags=re.IGNORECASE).strip()
    text = re.sub(r"[?!.,;:\"]+$", "", text).strip()
    text = re.sub(r"\s+", " ", text).strip()
    return text


async def generate_search_keywords(client: httpx.AsyncClient, raw_query: str, model: str = None) -> str:
    """Extract optimal search keywords from conversational prompts."""
    # Fast path: If query has high-confidence structured intent (like weather with zip code, stock price, etc.),
    # use clean_search_query directly to avoid 1-2 second LLM inference latency.
    cleaned = clean_search_query(raw_query)
    if cleaned.startswith("weather ") or re.search(r"\b(?:price|events(?:\s+\w+)?)$", cleaned, re.IGNORECASE):
        return cleaned

    target_model = model
    if not target_model:
        try:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/ps", timeout=1.0)
            if r.status_code == 200:
                running = r.json().get("models", [])
                if running:
                    target_model = running[0].get("name")
        except Exception:
            pass

    if not target_model:
        try:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=1.0)
            if r.status_code == 200:
                tags = r.json().get("models", [])
                if tags:
                    target_model = tags[0].get("name")
        except Exception:
            pass

    if not target_model:
        return cleaned

    prompt = (
        "You are an expert search query optimizer. Convert the user's conversational prompt into a concise 2-5 keyword search query.\n"
        "Rules:\n"
        "- Preserve all key entities: numbers, zip codes, years, proper nouns, and locations.\n"
        "- Remove greetings, politeness, and conversational filler.\n"
        "- Output ONLY the clean keywords, no quotes, no explanation.\n\n"
        "Examples:\n"
        "User: what will the weather be like tomorrow in zip code 68046\n"
        "Query: 68046 weather tomorrow\n\n"
        "User: who won the Super Bowl in 2026\n"
        "Query: Super Bowl 2026 winner\n\n"
        "User: what are the best coffee shops in downtown Seattle\n"
        "Query: best coffee shops downtown Seattle\n\n"
        f"User: {raw_query}\n"
        "Query:"
    )

    try:
        r = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": target_model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.0,
                    "num_predict": 12,
                    "stop": ["\n", ".", ","]
                }
            },
            timeout=3.0,
        )
        if r.status_code == 200:
            res = r.json().get("response", "").strip().strip('"\'`')
            res = re.sub(r"[?!.,;:\"']", " ", res)
            res = re.sub(r"\s+", " ", res).strip()
            words = res.split()
            if 1 <= len(words) <= 7:
                # Defensive entity check: if raw_query contains a zip code or year, verify it was preserved
                digits = re.findall(r"\b\d{4,5}\b", raw_query)
                if all(d in res for d in digits):
                    return res
    except Exception:
        pass

    return cleaned


@router.get("/api/search/status")
async def search_status():
    return JSONResponse({
        "enabled": bool(SEARXNG_URL)
    })


@router.get("/api/search")
async def search_web(q: str, request: Request, model: str = None):
    if not SEARXNG_URL:
        raise HTTPException(
            status_code=404,
            detail="Web search is not configured on this Lumina instance.",
        )

    raw_query = q.strip()
    if not raw_query:
        return JSONResponse({"query": "", "results": []})

    client: httpx.AsyncClient = request.app.state.http_client

    search_term = await generate_search_keywords(client, raw_query, model)
    if not search_term or len(search_term) < 2:
        search_term = clean_search_query(raw_query) or raw_query

    try:
        r = await client.get(
            f"{SEARXNG_URL}/search",
            params={
                "q": search_term,
                "format": "json",
                "engines": "google,bing",
            },
            timeout=10.0,
        )
        r.raise_for_status()
        data = r.json()

        results = []
        for item in data.get("results", []):
            title = item.get("title", "")
            snippet = item.get("content", "")
            engine = item.get("engine", "")
            if engine == "wikipedia" and "disambiguation" in snippet.lower():
                continue
            results.append({
                "title": title,
                "url": item.get("url", ""),
                "snippet": snippet,
                "engine": engine,
            })
            if len(results) >= 5:
                break

        return JSONResponse({"query": search_term, "raw_query": raw_query, "results": results})
    except Exception as e:
        return JSONResponse(
            {"query": search_term, "raw_query": raw_query, "results": [], "error": str(e)},
            status_code=502,
        )

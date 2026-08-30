import asyncio
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
import httpx

from .telemetry import get_system_stats


# ---------------------------------------------------------------------------
# Lifespan: shared httpx client with connection pooling
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(600.0, connect=10.0),
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=5),
    )
    yield
    await app.state.http_client.aclose()


app = FastAPI(title="Lumina UI Server", version="1.0.0", lifespan=lifespan)


# ---------------------------------------------------------------------------
# CORS: allow origins without credentials to support LAN / Tailscale
# ---------------------------------------------------------------------------
ALLOWED_ORIGINS = os.getenv(
    "LUMINA_CORS_ORIGINS",
    "*",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# CSP middleware: mitigate XSS impact
# ---------------------------------------------------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://cdn.tailwindcss.com https://cdn.jsdelivr.net 'unsafe-inline'; "
            "style-src 'self' https://fonts.googleapis.com https://cdn.jsdelivr.net 'unsafe-inline'; "
            "font-src https://fonts.gstatic.com; "
            "img-src 'self' data: blob:; "
            "connect-src 'self' ws: wss:; "
            "media-src 'self' blob:; "
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)


OLLAMA_BASE_URL = (
    os.getenv("OLLAMA_BASE_URL")
    or os.getenv("OLLAMA_HOST")
    or "http://localhost:11434"
).rstrip("/")


# ---------------------------------------------------------------------------
# Telemetry: cached broadcast to avoid per-client NVML calls
# ---------------------------------------------------------------------------
_telemetry_cache: dict = {}
_telemetry_cache_ts: float = 0.0
_TELEMETRY_INTERVAL: float = 1.0


def _get_cached_stats() -> dict:
    global _telemetry_cache, _telemetry_cache_ts
    now = time.monotonic()
    if now - _telemetry_cache_ts >= _TELEMETRY_INTERVAL:
        _telemetry_cache = get_system_stats()
        _telemetry_cache_ts = now
    return _telemetry_cache


@app.get("/api/sys/stats")
async def sys_stats():
    return JSONResponse(_get_cached_stats())


@app.websocket("/api/sys/ws")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            stats = _get_cached_stats()
            await websocket.send_json(stats)
            await asyncio.sleep(_TELEMETRY_INTERVAL)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Web Search: Progressive enhancement via optional SearXNG instance
# ---------------------------------------------------------------------------
SEARXNG_URL = os.getenv("SEARXNG_URL", "").rstrip("/")


def clean_search_query(text: str) -> str:
    """Normalize conversational prompts into focused search engine queries."""
    if not text:
        return ""
    # Normalize unicode curly apostrophes and quotes
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')

    # Weather intent detection & normalization
    # e.g., "what's the weather supposed to be like today in Omaha Nebraska?" -> "Omaha Nebraska weather"
    weather_match = re.search(r"\bweather\b.*?\b(?:in|for|at)\s+([a-zA-Z\s,]+)", text, re.IGNORECASE)
    if weather_match:
        loc = weather_match.group(1).strip()
        loc = re.sub(r"\b(today|tomorrow|this week|right now|currently|tonight)\b", "", loc, flags=re.IGNORECASE)
        loc = re.sub(r"[?!.,;:\"]", "", loc).strip()
        if loc:
            return f"{loc} weather".strip()

    # Strip conversational prefixes
    prefixes = [
        r"^(?:what(?:'s|\s+is|\s+are)?|tell\s+me\s+about|can\s+you\s+(?:tell\s+me|find|search)|how(?:\s+is|'s)|search\s+(?:for)?|find\s+(?:out)?|who\s+(?:is|was)|where\s+is|please\s+tell\s+me|give\s+me\s+(?:the)?)\s+(?:the\s+|a\s+|an\s+)?",
    ]
    for p in prefixes:
        text = re.sub(p, "", text, flags=re.IGNORECASE).strip()

    # Strip conversational filler phrases
    fillers = [
        r"\bsupposed\s+to\s+be\s+like\b",
        r"\bgoing\s+to\s+be\s+like\b",
        r"\blooks?\s+like\b",
        r"\blike\s+today\s+in\b",
    ]
    for f in fillers:
        text = re.sub(f, "", text, flags=re.IGNORECASE).strip()

    text = re.sub(r"[?!.,;:\"]+$", "", text).strip()
    text = re.sub(r"\s+", " ", text).strip()
    return text


@app.get("/api/search/status")
async def search_status():
    return JSONResponse({
        "enabled": bool(SEARXNG_URL)
    })


@app.get("/api/search")
async def search_web(q: str, request: Request):
    if not SEARXNG_URL:
        raise HTTPException(
            status_code=404,
            detail="Web search is not configured on this Lumina instance.",
        )

    raw_query = q.strip()
    if not raw_query:
        return JSONResponse({"query": "", "results": []})

    cleaned = clean_search_query(raw_query)
    search_term = cleaned if len(cleaned) >= 3 else raw_query

    client: httpx.AsyncClient = request.app.state.http_client
    try:
        r = await client.get(
            f"{SEARXNG_URL}/search",
            params={
                "q": search_term,
                "format": "json",
                "engines": "google,bing,wikipedia",
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
            # Filter out single-word dictionary definitions and disambiguation pages from Wikipedia
            if engine == "wikipedia" and (title.lower() in ("what", "whatsapp") or "disambiguation" in snippet.lower()):
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




# ---------------------------------------------------------------------------
# Ollama proxy with SSRF-prevention path whitelist
# ---------------------------------------------------------------------------
ALLOWED_OLLAMA_PATHS = frozenset({
    "tags",
    "chat",
    "generate",
    "pull",
    "delete",
    "show",
    "embeddings",
    "ps",
    "copy",
    "create",
    "version",
})


@app.api_route(
    "/api/ollama/{path:path}",
    methods=["GET", "POST", "DELETE", "PUT", "OPTIONS", "HEAD"],
)
async def proxy_ollama(path: str, request: Request):
    # Validate the top-level API path against the whitelist
    top_level = path.split("/")[0] if path else ""
    if top_level not in ALLOWED_OLLAMA_PATHS:
        raise HTTPException(
            status_code=403,
            detail=f"Ollama API path '{top_level}' is not allowed.",
        )

    url = f"{OLLAMA_BASE_URL}/api/{path}"
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length")
    }
    body = await request.body()

    client: httpx.AsyncClient = request.app.state.http_client
    req = client.build_request(
        method=request.method,
        url=url,
        headers=headers,
        content=body,
        params=request.query_params,
    )
    r = await client.send(req, stream=True)

    async def stream_response():
        try:
            async for chunk in r.aiter_raw():
                yield chunk
        finally:
            await r.aclose()

    return StreamingResponse(
        stream_response(),
        status_code=r.status_code,
        headers={
            k: v
            for k, v in r.headers.items()
            if k.lower() not in ("content-length", "content-encoding", "transfer-encoding")
        },
    )


# Static frontend mounting
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

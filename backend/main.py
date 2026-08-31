import asyncio
import json
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

    # 1. Weather intent: e.g. "what's the weather supposed to be like in Omaha?" -> "Omaha weather"
    weather_match = re.search(r"\bweather\b.*?\b(?:in|for|at)\s+([a-zA-Z\s,]+)", text, re.IGNORECASE)
    if weather_match:
        loc = weather_match.group(1).strip()
        loc = re.sub(r"\b(today|tomorrow|this week|right now|currently|tonight)\b", "", loc, flags=re.IGNORECASE)
        loc = re.sub(r"[?!.,;:\"]", "", loc).strip()
        if loc:
            return f"{loc} weather".strip()

    # 2. Events / Activities intent: e.g. "What big events are happening in Omaha in september?" -> "Omaha events september"
    event_match = re.search(
        r"\b(?:events?|things\s+to\s+do|festivals?|concerts?|activities)\b.*?\b(?:in|at|around)\s+([a-zA-Z\s,]+?)(?:\s+(?:in|during|for|this|next)\s+([a-zA-Z0-9\s]+))?$",
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

    # 3. Strip conversational prefixes
    prefixes = [
        r"^(?:what(?:'s|\s+is|\s+are)?|which|tell\s+me\s+about|can\s+you\s+(?:tell\s+me|find|search|show\s+me)|how(?:\s+is|'s)|search\s+(?:for)?|find\s+(?:out)?|who\s+(?:is|was)|where\s+is|please\s+tell\s+me|give\s+me\s+(?:the)?|show\s+me)\s+(?:the\s+|a\s+|an\s+|some\s+)?",
    ]
    for p in prefixes:
        text = re.sub(p, "", text, flags=re.IGNORECASE).strip()

    # 4. Strip conversational filler verbs and phrases
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
    ]
    for f in fillers:
        text = re.sub(f, "", text, flags=re.IGNORECASE).strip()

    # 5. Strip leading filler adjectives before subject
    text = re.sub(r"^(?:big|cool|fun|major|popular|best|top|upcoming|great)\s+", "", text, flags=re.IGNORECASE).strip()

    text = re.sub(r"[?!.,;:\"]+$", "", text).strip()
    text = re.sub(r"\s+", " ", text).strip()
    return text


async def generate_search_keywords(client: httpx.AsyncClient, raw_query: str, model: str = None) -> str:
    """Use Ollama to extract 2-4 optimal search keywords from conversational prompts in ~50ms."""
    target_model = model
    # Priority: check /api/ps first for already-loaded VRAM model to avoid disk load delay
    if not target_model:
        try:
            r = await client.get(f"{OLLAMA_BASE_URL}/api/ps", timeout=1.0)
            if r.status_code == 200:
                running = r.json().get("models", [])
                if running:
                    target_model = running[0].get("name")
        except Exception:
            pass

    # If nothing loaded in VRAM, try tags
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
        return clean_search_query(raw_query)

    prompt = (
        "You are a search engine query generator. Convert the user's question into a concise 2-4 keyword search query. "
        "Output ONLY the keywords, no punctuation, no quotes, no explanation.\n\n"
        f"Question: {raw_query}\n"
        "Keywords:"
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
                    "num_predict": 10,
                    "stop": ["\n", ".", ","]
                }
            },
            timeout=2.0,
        )
        if r.status_code == 200:
            res = r.json().get("response", "").strip().strip('"\'`')
            res = re.sub(r"[?!.,;:\"']", " ", res)
            res = re.sub(r"\s+", " ", res).strip()
            words = res.split()
            if 1 <= len(words) <= 6:
                return res
    except Exception:
        pass

    return clean_search_query(raw_query)


@app.get("/api/search/status")
async def search_status():
    return JSONResponse({
        "enabled": bool(SEARXNG_URL)
    })


@app.get("/api/search")
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

    # 1. Generate optimal search keywords via Ollama model or regex fallback
    search_term = await generate_search_keywords(client, raw_query, model)
    if not search_term or len(search_term) < 2:
        search_term = clean_search_query(raw_query) or raw_query

    # 2. Query SearXNG with google and bing
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
            # Filter out single-word dictionary definitions and disambiguation pages from Wikipedia
            if engine == "wikipedia" and (title.lower() in ("what", "whatsapp", "big") or "disambiguation" in snippet.lower()):
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




from backend.jobs import pull_manager, chat_manager

# ---------------------------------------------------------------------------
# Resilient Background Model Pulls (survives client disconnects)
# ---------------------------------------------------------------------------
@app.post("/api/models/pull")
async def start_model_pull(request: Request):
    data = await request.json()
    model_name = data.get("name", "").strip()
    if not model_name:
        raise HTTPException(status_code=400, detail="Missing model name")
    client: httpx.AsyncClient = request.app.state.http_client
    job = pull_manager.start_pull(model_name, OLLAMA_BASE_URL, client)
    return JSONResponse(job.to_dict())


@app.get("/api/models/pull/status")
async def get_model_pull_status():
    return JSONResponse({"pulls": pull_manager.get_active_jobs()})


@app.get("/api/models/pull/stream")
async def stream_model_pull(name: str):
    job = pull_manager.get_job(name)
    if not job:
        raise HTTPException(status_code=404, detail="Pull job not found")

    async def event_generator():
        q = job.add_listener()
        try:
            # Send current snapshot immediately
            yield f"data: {json.dumps(job.to_dict())}\n\n"
            while not job.done:
                try:
                    data_str = await asyncio.wait_for(q.get(), timeout=1.0)
                    yield f"data: {data_str}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
            # Final state
            yield f"data: {json.dumps(job.to_dict())}\n\n"
        finally:
            job.remove_listener(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/models/pull/cancel")
async def cancel_model_pull(request: Request):
    data = await request.json()
    model_name = data.get("name", "").strip()
    success = pull_manager.cancel_pull(model_name)
    return JSONResponse({"cancelled": success})


@app.post("/api/models/preload")
async def preload_model(request: Request):
    """Pre-warms and pins the model in VRAM immediately upon selection."""
    data = await request.json()
    model_name = data.get("model", "").strip()
    keep_alive = data.get("keep_alive", -1)
    if not model_name:
        raise HTTPException(status_code=400, detail="Missing model name")

    client: httpx.AsyncClient = request.app.state.http_client
    try:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": model_name, "prompt": "", "keep_alive": keep_alive},
            timeout=300.0,
        )
        return JSONResponse({"status": "loaded", "model": model_name, "keep_alive": keep_alive, "ollama": resp.json()})
    except Exception as e:
        return JSONResponse({"status": "error", "error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# Resilient Background Chat Inference (generates to completion even if window closes)
# ---------------------------------------------------------------------------
@app.post("/api/chat/generate")
async def start_chat_generation(request: Request):
    data = await request.json()
    session_id = data.get("session_id", "").strip()
    model = data.get("model", "").strip()
    messages = data.get("messages", [])
    sources = data.get("sources", [])
    options = data.get("options", {})
    keep_alive = data.get("keep_alive", -1)

    if not session_id or not model:
        raise HTTPException(status_code=400, detail="Missing session_id or model")

    ollama_payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "keep_alive": keep_alive,
        "options": options,
    }

    client: httpx.AsyncClient = request.app.state.http_client
    job = chat_manager.start_chat(session_id, model, ollama_payload, sources, OLLAMA_BASE_URL, client)

    async def chat_stream_generator():
        q = job.add_listener()
        try:
            while not job.done:
                try:
                    chunk_str = await asyncio.wait_for(q.get(), timeout=1.0)
                    yield chunk_str.encode("utf-8") + b"\n"
                except asyncio.TimeoutError:
                    pass
            while not q.empty():
                yield q.get_nowait().encode("utf-8") + b"\n"
        finally:
            job.remove_listener(q)

    return StreamingResponse(
        chat_stream_generator(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/chat/status/{session_id}")
async def get_chat_status(session_id: str):
    job = chat_manager.get_job(session_id)
    if not job:
        return JSONResponse({"active": False, "job": None})
    return JSONResponse({"active": not job.done, "job": job.to_dict()})


@app.get("/api/chat/stream/{session_id}")
async def resume_chat_stream(session_id: str):
    job = chat_manager.get_job(session_id)
    if not job:
        raise HTTPException(status_code=404, detail="Chat job not found")

    async def replay_and_stream_generator():
        q = job.add_listener()
        try:
            # Replay all accumulated chunks
            for chunk in job.chunks:
                yield json.dumps(chunk).encode("utf-8") + b"\n"

            while not job.done:
                try:
                    chunk_str = await asyncio.wait_for(q.get(), timeout=1.0)
                    yield chunk_str.encode("utf-8") + b"\n"
                except asyncio.TimeoutError:
                    pass
            while not q.empty():
                yield q.get_nowait().encode("utf-8") + b"\n"
        finally:
            job.remove_listener(q)

    return StreamingResponse(
        replay_and_stream_generator(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/chat/abort/{session_id}")
async def abort_chat_generation(session_id: str):
    success = chat_manager.abort_chat(session_id)
    return JSONResponse({"aborted": success})


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

    client: httpx.AsyncClient = request.app.state.http_client
    body = await request.body()

    # Intercept pull requests so they become detached background jobs automatically
    if path == "pull" and request.method == "POST":
        try:
            data = json.loads(body.decode("utf-8"))
            model_name = data.get("name", "").strip()
            if model_name:
                job = pull_manager.start_pull(model_name, OLLAMA_BASE_URL, client)

                async def stream_pull_response():
                    q = job.add_listener()
                    try:
                        while not job.done:
                            try:
                                chunk = await asyncio.wait_for(q.get(), timeout=1.0)
                                yield chunk.encode("utf-8") + b"\n"
                            except asyncio.TimeoutError:
                                pass
                        while not q.empty():
                            yield q.get_nowait().encode("utf-8") + b"\n"
                    finally:
                        job.remove_listener(q)

                return StreamingResponse(
                    stream_pull_response(),
                    media_type="application/x-ndjson",
                    headers={"Cache-Control": "no-cache"},
                )
        except Exception:
            pass

    url = f"{OLLAMA_BASE_URL}/api/{path}"
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "content-length")
    }

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

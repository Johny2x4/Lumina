import asyncio
import os
from pathlib import Path
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import httpx

from .telemetry import get_system_stats

app = FastAPI(title="Lumina UI Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")


@app.get("/api/sys/stats")
async def sys_stats():
    return JSONResponse(get_system_stats())


@app.websocket("/api/sys/ws")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            stats = get_system_stats()
            await websocket.send_json(stats)
            await asyncio.sleep(1.0)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:
        pass


# Standalone Ollama proxy fallback for local / non-nginx deployments
@app.api_route("/api/ollama/{path:path}", methods=["GET", "POST", "DELETE", "PUT", "OPTIONS", "HEAD"])
async def proxy_ollama(path: str, request: Request):
    url = f"{OLLAMA_BASE_URL}/api/{path}"
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    body = await request.body()

    client = httpx.AsyncClient(timeout=600.0)
    req = client.build_request(
        method=request.method,
        url=url,
        headers=headers,
        content=body,
        params=request.query_params
    )
    r = await client.send(req, stream=True)

    async def stream_response():
        try:
            async for chunk in r.aiter_raw():
                yield chunk
        finally:
            await r.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_response(),
        status_code=r.status_code,
        headers={k: v for k, v in r.headers.items() if k.lower() not in ("content-length", "content-encoding", "transfer-encoding")}
    )


# Static frontend mounting
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

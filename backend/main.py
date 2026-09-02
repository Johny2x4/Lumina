import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
import httpx

from .config import ALLOWED_ORIGINS
from .routers.telemetry import router as telemetry_router
from .routers.models import router as models_router
from .routers.chat import router as chat_router
from .routers.voice import router as voice_router
from .routers.search import router as search_router
from .routers.ollama import router as ollama_router

logger = logging.getLogger("lumina.server")


# ---------------------------------------------------------------------------
# Lifespan: shared httpx client with connection pooling
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http_client = httpx.AsyncClient(
        timeout=httpx.Timeout(600.0, connect=10.0),
        limits=httpx.Limits(max_connections=20, max_keepalive_connections=5),
    )
    auth_token = os.getenv("LUMINA_AUTH_TOKEN", "").strip()
    if not auth_token:
        logger.info("Lumina running in Open Access Mode (no token set). Set LUMINA_AUTH_TOKEN to require authentication.")
    else:
        logger.info("Lumina running in Authenticated Mode (token configured).")
    yield
    await app.state.http_client.aclose()


app = FastAPI(title="Lumina UI Server", version="1.1.0", lifespan=lifespan)


# ---------------------------------------------------------------------------
# CORS: allow origins without credentials to support LAN / Tailscale
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
            "script-src 'self'; "
            "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data: blob:; "
            "connect-src 'self' ws: wss:; "
            "media-src 'self' blob:; "
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ---------------------------------------------------------------------------
# Unauthenticated health check endpoint for Docker & reverse proxies
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "app": "Lumina"}


# ---------------------------------------------------------------------------
# API Routers
# ---------------------------------------------------------------------------
app.include_router(telemetry_router)
app.include_router(models_router)
app.include_router(chat_router)
app.include_router(voice_router)
app.include_router(search_router)
app.include_router(ollama_router)


# ---------------------------------------------------------------------------
# Static frontend mounting
# ---------------------------------------------------------------------------
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

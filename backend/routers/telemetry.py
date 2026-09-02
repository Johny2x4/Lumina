import asyncio
import secrets
import time
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from ..auth import get_configured_token, verify_lumina_token
from ..telemetry import get_system_stats

router = APIRouter(tags=["telemetry"])

_telemetry_cache: dict = {}
_telemetry_cache_ts: float = 0.0
_TELEMETRY_INTERVAL: float = 1.0


async def get_cached_stats() -> dict:
    global _telemetry_cache, _telemetry_cache_ts
    now = time.monotonic()
    if now - _telemetry_cache_ts >= _TELEMETRY_INTERVAL:
        _telemetry_cache = await asyncio.to_thread(get_system_stats)
        _telemetry_cache_ts = now
    return _telemetry_cache


@router.get("/api/sys/stats", dependencies=[Depends(verify_lumina_token)])
async def sys_stats():
    return JSONResponse(await get_cached_stats())


@router.websocket("/api/sys/ws")
async def websocket_telemetry(websocket: WebSocket):
    expected_token = get_configured_token()
    if expected_token:
        token = websocket.query_params.get("token", "").strip() or websocket.headers.get("x-lumina-token", "").strip()
        if not token or not secrets.compare_digest(token, expected_token):
            await websocket.close(code=1008)
            return

    await websocket.accept()
    try:
        while True:
            stats = await get_cached_stats()
            await websocket.send_json(stats)
            await asyncio.sleep(_TELEMETRY_INTERVAL)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:
        pass

import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
import httpx

from ..auth import verify_lumina_token
from ..config import OLLAMA_BASE_URL
from ..jobs import pull_manager

router = APIRouter(tags=["models"], dependencies=[Depends(verify_lumina_token)])


@router.post("/api/models/pull")
async def start_model_pull(request: Request):
    data = await request.json()
    model_name = data.get("name", "").strip()
    if not model_name:
        raise HTTPException(status_code=400, detail="Missing model name")
    client: httpx.AsyncClient = request.app.state.http_client
    job = pull_manager.start_pull(model_name, OLLAMA_BASE_URL, client)
    return JSONResponse(job.to_dict())


@router.get("/api/models/pull/status")
async def get_model_pull_status():
    return JSONResponse({"pulls": pull_manager.get_active_jobs()})


@router.get("/api/models/pull/stream")
async def stream_model_pull(name: str):
    job = pull_manager.get_job(name)
    if not job:
        raise HTTPException(status_code=404, detail="Pull job not found")

    async def event_generator():
        q = job.add_listener()
        try:
            yield f"data: {json.dumps(job.to_dict())}\n\n"
            while not job.done:
                try:
                    data_str = await asyncio.wait_for(q.get(), timeout=1.0)
                    yield f"data: {data_str}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
            yield f"data: {json.dumps(job.to_dict())}\n\n"
        finally:
            job.remove_listener(q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/api/models/pull/cancel")
async def cancel_model_pull(request: Request):
    data = await request.json()
    model_name = data.get("name", "").strip()
    success = pull_manager.cancel_pull(model_name)
    return JSONResponse({"cancelled": success})


@router.post("/api/models/unload")
async def unload_models(request: Request):
    """Unloads any active models from GPU VRAM immediately."""
    client: httpx.AsyncClient = request.app.state.http_client
    try:
        data = await request.json()
    except Exception:
        data = {}
    target_model = data.get("model")

    unloaded = []
    try:
        ps_resp = await client.get(f"{OLLAMA_BASE_URL}/api/ps", timeout=5.0)
        if ps_resp.status_code == 200:
            for m in ps_resp.json().get("models", []):
                m_name = m.get("name") or m.get("model")
                if m_name and (not target_model or m_name == target_model):
                    await client.post(
                        f"{OLLAMA_BASE_URL}/api/generate",
                        json={"model": m_name, "keep_alive": 0},
                        timeout=10.0,
                    )
                    unloaded.append(m_name)
    except Exception:
        pass

    if target_model and target_model not in unloaded:
        try:
            await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={"model": target_model, "keep_alive": 0},
                timeout=5.0,
            )
            unloaded.append(target_model)
        except Exception:
            pass

    return JSONResponse({"status": "flushed", "unloaded": unloaded})


@router.post("/api/models/preload")
async def preload_model(request: Request):
    """Flushes previous model from VRAM and pre-warms the new model."""
    data = await request.json()
    model_name = data.get("model", "").strip()
    keep_alive = data.get("keep_alive", -1)
    if not model_name:
        raise HTTPException(status_code=400, detail="Missing model name")

    client: httpx.AsyncClient = request.app.state.http_client

    try:
        ps_resp = await client.get(f"{OLLAMA_BASE_URL}/api/ps", timeout=3.0)
        if ps_resp.status_code == 200:
            for m in ps_resp.json().get("models", []):
                old_name = m.get("name") or m.get("model")
                if old_name and old_name != model_name:
                    await client.post(
                        f"{OLLAMA_BASE_URL}/api/generate",
                        json={"model": old_name, "keep_alive": 0},
                        timeout=10.0,
                    )
    except Exception:
        pass

    try:
        resp = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={"model": model_name, "prompt": "", "keep_alive": keep_alive},
            timeout=300.0,
        )
        return JSONResponse({"status": "loaded", "model": model_name, "keep_alive": keep_alive, "ollama": resp.json()})
    except Exception as e:
        return JSONResponse({"status": "error", "error": str(e)}, status_code=500)

import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
import httpx

from ..auth import verify_lumina_token
from ..config import OLLAMA_BASE_URL
from ..jobs import chat_manager

router = APIRouter(tags=["chat"], dependencies=[Depends(verify_lumina_token)])


@router.post("/api/chat/generate")
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
    q = job.add_listener()

    async def chat_stream_generator():
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


@router.get("/api/chat/status/{session_id}")
async def get_chat_status(session_id: str):
    job = chat_manager.get_job(session_id)
    if not job:
        return JSONResponse({"active": False, "job": None})
    return JSONResponse({"active": not job.done, "job": job.to_dict()})


@router.get("/api/chat/stream/{session_id}")
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


@router.post("/api/chat/abort/{session_id}")
async def abort_chat_generation(session_id: str):
    success = chat_manager.abort_chat(session_id)
    return JSONResponse({"aborted": success})

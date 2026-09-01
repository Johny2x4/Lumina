import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
import httpx

from ..auth import verify_lumina_token
from ..config import OLLAMA_BASE_URL
from ..jobs import pull_manager

router = APIRouter(tags=["ollama"], dependencies=[Depends(verify_lumina_token)])

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


@router.api_route(
    "/api/ollama/{path:path}",
    methods=["GET", "POST", "DELETE", "PUT", "OPTIONS", "HEAD"],
)
async def proxy_ollama(path: str, request: Request):
    # Prevent path traversal attacks
    if ".." in path or "\\" in path or "//" in path:
        raise HTTPException(
            status_code=400,
            detail="Invalid API path.",
        )

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

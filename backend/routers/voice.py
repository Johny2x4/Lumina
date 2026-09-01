from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
import httpx

from ..auth import verify_lumina_token
from ..config import KOKORO_BASE_URL

router = APIRouter(tags=["voice"], dependencies=[Depends(verify_lumina_token)])

DEFAULT_KOKORO_VOICES = [
    {"id": "af_heart", "name": "Heart (US Female - Warm)", "gender": "female", "lang": "en-US"},
    {"id": "af_bella", "name": "Bella (US Female - Friendly)", "gender": "female", "lang": "en-US"},
    {"id": "af_sarah", "name": "Sarah (US Female - Professional)", "gender": "female", "lang": "en-US"},
    {"id": "am_adam", "name": "Adam (US Male - Conversational)", "gender": "male", "lang": "en-US"},
    {"id": "am_michael", "name": "Michael (US Male - Confident)", "gender": "male", "lang": "en-US"},
    {"id": "bf_emma", "name": "Emma (UK Female - Expressive)", "gender": "female", "lang": "en-GB"},
    {"id": "bf_isabella", "name": "Isabella (UK Female - Natural)", "gender": "female", "lang": "en-GB"},
    {"id": "bm_george", "name": "George (UK Male - Articulate)", "gender": "male", "lang": "en-GB"},
    {"id": "bm_lewis", "name": "Lewis (UK Male - Warm)", "gender": "male", "lang": "en-GB"},
]


@router.get("/api/voice/status")
async def get_voice_status(request: Request):
    """Auto-detects whether an optional local Kokoro-82M neural TTS container is available."""
    client: httpx.AsyncClient = request.app.state.http_client
    try:
        resp = await client.get(f"{KOKORO_BASE_URL}/v1/audio/voices", timeout=1.5)
        if resp.status_code == 200:
            data = resp.json()
            voices = []
            if isinstance(data, dict) and "voices" in data:
                for v in data["voices"]:
                    if isinstance(v, str):
                        voices.append({"id": v, "name": v.replace("_", " ").title()})
                    elif isinstance(v, dict):
                        voices.append(v)
            if not voices:
                voices = DEFAULT_KOKORO_VOICES
            return JSONResponse({"available": True, "engine": "kokoro", "voices": voices})
    except Exception:
        pass

    return JSONResponse({"available": False, "engine": "browser", "voices": []})


@router.post("/api/voice/tts")
async def generate_speech(request: Request):
    """Proxies audio synthesis to Kokoro's OpenAI-compatible /v1/audio/speech endpoint."""
    client: httpx.AsyncClient = request.app.state.http_client
    try:
        body = await request.json()
        text = body.get("text", "").strip()
        voice = body.get("voice", "af_heart")
        speed = body.get("speed", 1.0)

        if not text:
            raise HTTPException(status_code=400, detail="Missing text to synthesize")

        kokoro_payload = {
            "model": "kokoro",
            "input": text,
            "voice": voice,
            "response_format": "mp3",
            "speed": speed,
        }

        resp = await client.post(
            f"{KOKORO_BASE_URL}/v1/audio/speech",
            json=kokoro_payload,
            timeout=30.0,
        )

        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Kokoro TTS error: {resp.text}")

        return Response(
            content=resp.content,
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-cache"},
        )
    except HTTPException:
        raise
    except Exception as e:
        return JSONResponse({"error": f"Local neural TTS unreachable: {str(e)}"}, status_code=502)

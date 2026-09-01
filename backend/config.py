import os

OLLAMA_BASE_URL = (
    os.getenv("OLLAMA_BASE_URL")
    or os.getenv("OLLAMA_HOST")
    or "http://localhost:11434"
).rstrip("/")

KOKORO_BASE_URL = os.getenv("KOKORO_BASE_URL", "http://kokoro:8880").rstrip("/")

SEARXNG_URL = os.getenv("SEARXNG_URL", "").rstrip("/")

ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("LUMINA_CORS_ORIGINS", "*").split(",") if o.strip()
]

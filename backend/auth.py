import os
from typing import Optional
from fastapi import HTTPException, Request, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer(auto_error=False)


def get_configured_token() -> str:
    return os.getenv("LUMINA_AUTH_TOKEN", "").strip()


async def verify_lumina_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Optional[str]:
    """
    Validates authentication token if LUMINA_AUTH_TOKEN environment variable is set.
    If LUMINA_AUTH_TOKEN is unset or empty, all requests are permitted (backward-compatible).
    """
    expected_token = get_configured_token()
    if not expected_token:
        return None  # Open access mode

    # 1. Check Bearer token in Authorization header
    if credentials and credentials.credentials == expected_token:
        return expected_token

    # 2. Check X-Lumina-Token header
    header_token = request.headers.get("X-Lumina-Token", "").strip()
    if header_token == expected_token:
        return expected_token

    # 3. Check query param (for EventSource or WebSocket)
    query_token = request.query_params.get("token", "").strip()
    if query_token == expected_token:
        return expected_token

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized: invalid or missing authentication token.",
        headers={"WWW-Authenticate": "Bearer"},
    )

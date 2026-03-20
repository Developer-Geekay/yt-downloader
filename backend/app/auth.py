from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import secrets
from .config import BASIC_AUTH_USERNAME, BASIC_AUTH_PASSWORD, IS_ELECTRON_MODE

security = HTTPBasic(auto_error=not IS_ELECTRON_MODE)

def basic_auth(credentials: HTTPBasicCredentials = Depends(security)):
    # Skip auth in Electron desktop mode (single-user, localhost only)
    if IS_ELECTRON_MODE:
        return "desktop-user"

    if not credentials or not (
        secrets.compare_digest(credentials.username, BASIC_AUTH_USERNAME)
        and secrets.compare_digest(credentials.password, BASIC_AUTH_PASSWORD)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Basic"},
        )
    return credentials.username


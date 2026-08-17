import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import get_settings

passwords = PasswordHash.recommended()


def normalize_email(email: str) -> str:
    return email.strip().casefold()


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def opaque_secret() -> str:
    return secrets.token_urlsafe(48)


def access_token(user_id: str) -> tuple[str, datetime]:
    expires = datetime.now(UTC) + timedelta(minutes=get_settings().access_token_minutes)
    token = jwt.encode(
        {"sub": user_id, "exp": expires, "type": "access"},
        get_settings().jwt_secret.get_secret_value(),
        algorithm="HS256",
    )
    return token, expires


def decode_access(token: str) -> str:
    payload = jwt.decode(token, get_settings().jwt_secret.get_secret_value(), algorithms=["HS256"])
    if payload.get("type") != "access" or not payload.get("sub"):
        raise jwt.InvalidTokenError
    return str(payload["sub"])

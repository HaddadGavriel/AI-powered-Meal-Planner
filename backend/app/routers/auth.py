from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api_support import (
    audit,
    auth_json,
    current_membership,
    limited,
    set_refresh,
)
from app.config import get_settings
from app.database import get_db
from app.errors import ApiError
from app.models import (
    Membership,
    RefreshSession,
    User,
)
from app.schemas import (
    AuthResponse,
    Login,
)
from app.security import (
    hash_secret,
    normalize_email,
    passwords,
)

router = APIRouter()


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(select(1))
    return {"status": "ok"}


@router.post("/auth/login", response_model=AuthResponse)
def login(
    body: Login, request: Request, response: Response, db: Session = Depends(get_db)
) -> dict[str, object]:
    limited(f"login:{request.client.host if request.client else 'unknown'}", 10)
    email = normalize_email(str(body.email))
    user = db.scalar(select(User).where(User.email == email))
    if not user or not passwords.verify(body.password, user.password_hash):
        raise ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
    member = db.scalar(
        select(Membership).where(Membership.user_id == user.id, Membership.status == "active")
    )
    if not member:
        raise ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.")
    set_refresh(response, db, user.id)
    audit(db, member, member.household_id, "auth.login", "user", user.id, "Signed in.")
    db.commit()
    return auth_json(member)


@router.post("/auth/refresh", response_model=AuthResponse)
def refresh(
    request: Request,
    response: Response,
    token: str | None = Cookie(None, alias=get_settings().refresh_cookie_name),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    limited(f"refresh:{request.client.host if request.client else 'unknown'}", 30)
    session = db.scalar(
        select(RefreshSession)
        .where(RefreshSession.token_hash == hash_secret(token or ""))
        .with_for_update()
    )
    if not session or session.revoked_at or session.expires_at <= datetime.now(UTC):
        raise ApiError(401, "INVALID_REFRESH", "The refresh credential is invalid or expired.")
    session.revoked_at = datetime.now(UTC)
    member = db.scalar(
        select(Membership).where(
            Membership.user_id == session.user_id, Membership.status == "active"
        )
    )
    if not member:
        session.revoked_at = datetime.now(UTC)
        db.commit()
        response.delete_cookie(get_settings().refresh_cookie_name, path="/api/v1/auth")
        raise ApiError(401, "INVALID_REFRESH", "The refresh credential is invalid or expired.")
    set_refresh(response, db, session.user_id)
    db.commit()
    return auth_json(member)


@router.post("/auth/logout", status_code=204)
def logout(
    response: Response,
    member: Membership = Depends(current_membership),
    token: str | None = Cookie(None, alias=get_settings().refresh_cookie_name),
    db: Session = Depends(get_db),
) -> None:
    session = db.scalar(
        select(RefreshSession).where(RefreshSession.token_hash == hash_secret(token or ""))
    )
    if session and session.user_id == member.user_id:
        session.revoked_at = datetime.now(UTC)
    response.delete_cookie(get_settings().refresh_cookie_name, path="/api/v1/auth")
    audit(db, member, member.household_id, "auth.logout", "user", member.user_id, "Signed out.")
    db.commit()

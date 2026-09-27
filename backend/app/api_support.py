import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Depends, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.errors import ApiError
from app.models import (
    AuditEvent,
    Invitation,
    InvitationStatus,
    Membership,
    RefreshSession,
    Role,
)
from app.rate_limit import rate_limiter
from app.schemas import AuthResponse, MemberResponse
from app.security import (
    access_token,
    decode_access,
    hash_secret,
    opaque_secret,
)

bearer = HTTPBearer(auto_error=False)


def limited(key: str, maximum: int = 20) -> None:
    rate_limiter.check(key, maximum)


def current_membership(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> Membership:
    if not credentials:
        raise ApiError(401, "UNAUTHENTICATED", "Authentication is required.")
    try:
        user_id = uuid.UUID(decode_access(credentials.credentials))
    except (jwt.InvalidTokenError, ValueError):
        raise ApiError(401, "UNAUTHENTICATED", "The access token is invalid or expired.") from None
    membership = db.scalar(
        select(Membership).where(Membership.user_id == user_id, Membership.status == "active")
    )
    if not membership:
        raise ApiError(401, "UNAUTHENTICATED", "The account is not an active household member.")
    return membership


def elevated(member: Membership) -> None:
    if member.role not in (Role.owner, Role.administrator):
        raise ApiError(403, "FORBIDDEN", "Administrator access is required.")


def audit(
    db: Session,
    member: Membership | None,
    household_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: object,
    summary: str,
) -> None:
    db.add(
        AuditEvent(
            household_id=household_id,
            actor_id=member.id if member else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            timestamp=datetime.now(UTC),
            summary=summary,
            details={},
        )
    )


def build_member_response(m: Membership) -> MemberResponse:
    initials = "".join(word[0] for word in m.user.name.split()[:2]).upper()
    return MemberResponse(
        id=m.id,
        name=m.user.name,
        email=m.user.email,
        avatar_initials=initials,
        role=m.role.value,
        status=m.status,
        joined_at=m.joined_at,
    )


def expire_invitations(db: Session, household_id: uuid.UUID | None = None) -> None:
    query = (
        update(Invitation)
        .where(
            Invitation.status == InvitationStatus.pending,
            Invitation.expires_at <= datetime.now(UTC),
        )
        .values(status=InvitationStatus.expired)
    )
    if household_id is not None:
        query = query.where(Invitation.household_id == household_id)
    db.execute(query)


def set_refresh(response: Response, db: Session, user_id: uuid.UUID) -> None:
    secret = opaque_secret()
    settings = get_settings()
    expires = datetime.now(UTC) + timedelta(days=settings.refresh_token_days)
    db.add(RefreshSession(user_id=user_id, token_hash=hash_secret(secret), expires_at=expires))
    response.set_cookie(
        settings.refresh_cookie_name,
        secret,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.refresh_token_days * 86400,
        path="/api/v1/auth",
    )


def build_auth_response(m: Membership) -> AuthResponse:
    token, expires = access_token(str(m.user_id))
    return AuthResponse(access_token=token, expires_at=expires, user=build_member_response(m))


def find_invitation(db: Session, invitation_id: uuid.UUID, actor: Membership) -> Invitation:
    elevated(actor)
    invitation = db.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id, Invitation.household_id == actor.household_id
        )
    )
    if not invitation:
        raise ApiError(404, "NOT_FOUND", "Invitation not found.")
    return invitation

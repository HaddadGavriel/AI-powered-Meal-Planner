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
    DietaryProfile,
    Household,
    Invitation,
    InvitationStatus,
    Membership,
    RefreshSession,
    Role,
)
from app.rate_limit import rate_limiter
from app.schemas import (
    iso,
)
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


def member_json(m: Membership) -> dict[str, object]:
    initials = "".join(word[0] for word in m.user.name.split()[:2]).upper()
    return {
        "id": str(m.id),
        "name": m.user.name,
        "email": m.user.email,
        "avatarInitials": initials,
        "role": m.role.value,
        "status": m.status,
        "joinedAt": iso(m.joined_at),
    }


def household_json(h: Household) -> dict[str, object]:
    value: dict[str, object] = {
        "id": str(h.id),
        "name": h.name,
        "timezone": h.timezone,
        "defaultServings": h.default_servings,
        "updatedAt": iso(h.updated_at),
    }
    if h.notes is not None:
        value["notes"] = h.notes
    return value


def invitation_json(i: Invitation) -> dict[str, object]:
    status = (
        InvitationStatus.expired
        if i.status == InvitationStatus.pending and i.expires_at <= datetime.now(UTC)
        else i.status
    )
    value: dict[str, object] = {
        "id": str(i.id),
        "householdId": str(i.household_id),
        "email": i.email,
        "proposedRole": i.proposed_role.value,
        "invitedBy": str(i.invited_by),
        "createdAt": iso(i.created_at),
        "expiresAt": iso(i.expires_at),
        "status": status.value,
    }
    if i.accepted_at:
        value["acceptedAt"] = iso(i.accepted_at)
    return value


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


def dietary_json(d: DietaryProfile) -> dict[str, object]:
    return {
        "id": str(d.id),
        "memberId": str(d.membership_id),
        "dietaryPatterns": d.dietary_patterns,
        "allergens": d.allergens,
        "excludedIngredients": d.excluded_ingredients,
        "preferences": d.preferences,
        "updatedAt": iso(d.updated_at),
    }


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


def auth_json(m: Membership) -> dict[str, object]:
    token, expires = access_token(str(m.user_id))
    return {"accessToken": token, "expiresAt": iso(expires), "user": member_json(m)}


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


def audit_json(e: AuditEvent) -> dict[str, object]:
    value: dict[str, object] = {
        "id": str(e.id),
        "action": e.action,
        "entityType": e.entity_type,
        "entityId": e.entity_id,
        "timestamp": iso(e.timestamp),
        "summary": e.summary,
    }
    if e.actor_id:
        value["actorId"] = str(e.actor_id)
    return value

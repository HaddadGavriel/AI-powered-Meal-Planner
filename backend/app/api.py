import time
import uuid
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Cookie, Depends, Query, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
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
    User,
)
from app.schemas import (
    AcceptInvitation,
    DietaryInput,
    HouseholdPatch,
    InvitationCreate,
    Login,
    RolePatch,
    UserPatch,
    iso,
    page,
)
from app.security import (
    access_token,
    decode_access,
    hash_secret,
    normalize_email,
    opaque_secret,
    passwords,
)

router = APIRouter(prefix="/api/v1")
bearer = HTTPBearer(auto_error=False)
attempts: dict[str, deque[float]] = defaultdict(deque)


def limited(key: str, maximum: int = 20) -> None:
    now = time.monotonic()
    bucket = attempts[key]
    while bucket and bucket[0] < now - 60:
        bucket.popleft()
    if len(bucket) >= maximum:
        raise ApiError(429, "RATE_LIMITED", "Too many requests. Try again later.")
    bucket.append(now)


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
            actor_id=member.user_id if member else None,
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
    value = {
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
    value = {
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


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(select(1))
    return {"status": "ok"}


@router.post("/auth/login")
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
    assert member
    set_refresh(response, db, user.id)
    audit(db, member, member.household_id, "auth.login", "user", user.id, "Signed in.")
    db.commit()
    return auth_json(member)


@router.post("/auth/refresh")
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
    assert member
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


@router.get("/users/me")
def me(member: Membership = Depends(current_membership)) -> dict[str, object]:
    return member_json(member)


@router.patch("/users/me")
def patch_me(
    body: UserPatch, member: Membership = Depends(current_membership), db: Session = Depends(get_db)
) -> dict[str, object]:
    if body.email is not None:
        email = normalize_email(str(body.email))
        collision = db.scalar(select(User.id).where(User.email == email, User.id != member.user_id))
        pending = db.scalar(
            select(Invitation.id).where(
                Invitation.email == email,
                Invitation.status == InvitationStatus.pending,
                Invitation.expires_at > datetime.now(UTC),
            )
        )
        if collision or pending:
            raise ApiError(409, "DUPLICATE", "That email is already in use or invited.")
        member.user.email = email
    if body.name is not None:
        member.user.name = body.name.strip()
    audit(
        db, member, member.household_id, "user.updated", "user", member.user_id, "Updated profile."
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApiError(409, "DUPLICATE", "That email is already in use.") from None
    return member_json(member)


@router.patch("/household")
def patch_household(
    body: HouseholdPatch,
    member: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    elevated(member)
    h = db.get(Household, member.household_id)
    assert h
    fields = body.model_dump(exclude_unset=True)
    for wire, attr in (
        ("name", "name"),
        ("timezone", "timezone"),
        ("defaultServings", "default_servings"),
        ("notes", "notes"),
    ):
        if wire in fields:
            setattr(h, attr, fields[wire])
    h.updated_at = datetime.now(UTC)
    audit(db, member, h.id, "household.updated", "household", h.id, "Updated household.")
    db.commit()
    return household_json(h)


@router.get("/household/members")
def members(
    page_number: int = Query(1, alias="page", ge=1),
    page_size: int = Query(25, alias="pageSize", ge=1, le=100),
    role: Role | None = None,
    status: str | None = None,
    search: str | None = None,
    member: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    query = select(Membership).join(User).where(Membership.household_id == member.household_id)
    if role:
        query = query.where(Membership.role == role)
    if status:
        query = query.where(Membership.status == status)
    if search:
        query = query.where(or_(User.name.ilike(f"%{search}%"), User.email.ilike(f"%{search}%")))
    rows = list(
        db.scalars(query.order_by(User.name).offset((page_number - 1) * page_size).limit(page_size))
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    return page([member_json(x) for x in rows], page_number, page_size, total)


@router.put("/household/members/{member_id}/dietary-profile")
def put_diet(
    member_id: uuid.UUID,
    body: DietaryInput,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    if actor.id != member_id:
        raise ApiError(403, "FORBIDDEN", "Members may edit only their own dietary profile.")
    profile = db.scalar(select(DietaryProfile).where(DietaryProfile.membership_id == member_id))
    assert profile
    (
        profile.dietary_patterns,
        profile.allergens,
        profile.excluded_ingredients,
        profile.preferences,
        profile.updated_at,
    ) = (
        body.dietaryPatterns,
        body.allergens,
        body.excludedIngredients,
        body.preferences,
        datetime.now(UTC),
    )
    audit(
        db,
        actor,
        actor.household_id,
        "dietary_profile.updated",
        "dietary_profile",
        profile.id,
        "Updated dietary profile.",
    )
    db.commit()
    return dietary_json(profile)


@router.patch("/household/members/{member_id}")
def patch_member(
    member_id: uuid.UUID,
    body: RolePatch,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    elevated(actor)
    target = db.scalar(
        select(Membership)
        .where(Membership.id == member_id, Membership.household_id == actor.household_id)
        .with_for_update()
    )
    if not target:
        raise ApiError(404, "NOT_FOUND", "Member not found.")
    if actor.role != Role.owner and (target.role == Role.owner or body.role == "owner"):
        raise ApiError(403, "FORBIDDEN", "Only an owner may manage owners.")
    if target.role == Role.owner and body.role != "owner":
        owners = db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(
                Membership.household_id == actor.household_id,
                Membership.role == Role.owner,
                Membership.status == "active",
            )
        )
        if owners == 1:
            raise ApiError(409, "ONLY_OWNER", "The final owner cannot be demoted.")
    target.role = Role(body.role)
    audit(
        db,
        actor,
        actor.household_id,
        "member.role_changed",
        "member",
        target.id,
        "Changed household role.",
    )
    db.commit()
    return member_json(target)


@router.delete("/household/members/{member_id}", status_code=204)
def delete_member(
    member_id: uuid.UUID,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> None:
    elevated(actor)
    target = db.scalar(
        select(Membership)
        .where(Membership.id == member_id, Membership.household_id == actor.household_id)
        .with_for_update()
    )
    if not target:
        raise ApiError(404, "NOT_FOUND", "Member not found.")
    if target.role == Role.owner and actor.role != Role.owner:
        raise ApiError(403, "FORBIDDEN", "Administrators cannot remove owners.")
    if target.role == Role.owner:
        owners = db.scalar(
            select(func.count())
            .select_from(Membership)
            .where(
                Membership.household_id == actor.household_id,
                Membership.role == Role.owner,
                Membership.status == "active",
            )
        )
        if owners == 1:
            raise ApiError(409, "ONLY_OWNER", "The final owner cannot be removed.")
    target.status = "inactive"
    audit(
        db,
        actor,
        actor.household_id,
        "member.removed",
        "member",
        target.id,
        "Removed household member.",
    )
    db.commit()


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


@router.post("/household/invitations", status_code=201)
def create_invitation(
    body: InvitationCreate,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    elevated(actor)
    email = normalize_email(str(body.email))
    now = datetime.now(UTC)
    expired = list(
        db.scalars(
            select(Invitation).where(
                Invitation.household_id == actor.household_id,
                Invitation.email == email,
                Invitation.status == InvitationStatus.pending,
                Invitation.expires_at <= now,
            )
        )
    )
    for old_invitation in expired:
        old_invitation.status = InvitationStatus.expired
    if expired:
        db.flush()
    active = db.scalar(
        select(User.id)
        .join(Membership)
        .where(
            User.email == email,
            Membership.household_id == actor.household_id,
            Membership.status == "active",
        )
    )
    pending = db.scalar(
        select(Invitation.id).where(
            Invitation.household_id == actor.household_id,
            Invitation.email == email,
            Invitation.status == InvitationStatus.pending,
            Invitation.expires_at > now,
        )
    )
    if active or pending:
        raise ApiError(
            409, "DUPLICATE", "That person is already a member or has a pending invitation."
        )
    invitation = Invitation(
        household_id=actor.household_id,
        email=email,
        proposed_role=Role(body.proposedRole),
        invited_by=actor.user_id,
        token_hash=hash_secret(opaque_secret()),
        created_at=now,
        expires_at=now + timedelta(days=get_settings().invitation_days),
        status=InvitationStatus.pending,
    )
    db.add(invitation)
    audit(
        db,
        actor,
        actor.household_id,
        "invitation.created",
        "invitation",
        invitation.id,
        "Created invitation.",
    )
    db.commit()
    return invitation_json(invitation)


@router.get("/household/invitations")
def list_invitations(
    page_number: int = Query(1, alias="page", ge=1),
    page_size: int = Query(25, alias="pageSize", ge=1, le=100),
    status: InvitationStatus | None = None,
    search: str | None = None,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    elevated(actor)
    query = select(Invitation).where(Invitation.household_id == actor.household_id)
    if status:
        query = query.where(Invitation.status == status)
    if search:
        query = query.where(Invitation.email.ilike(f"%{search}%"))
    rows = list(
        db.scalars(
            query.order_by(Invitation.created_at.desc())
            .offset((page_number - 1) * page_size)
            .limit(page_size)
        )
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    return page([invitation_json(x) for x in rows], page_number, page_size, total)


@router.post("/household/invitations/{invitation_id}/resend")
def resend(
    invitation_id: uuid.UUID,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    invitation = find_invitation(db, invitation_id, actor)
    if invitation.status != InvitationStatus.pending:
        raise ApiError(410, "INVITATION_UNAVAILABLE", "The invitation is no longer pending.")
    invitation.token_hash = hash_secret(opaque_secret())
    invitation.expires_at = datetime.now(UTC) + timedelta(days=get_settings().invitation_days)
    audit(
        db,
        actor,
        actor.household_id,
        "invitation.resent",
        "invitation",
        invitation.id,
        "Rotated invitation capability.",
    )
    db.commit()
    return invitation_json(invitation)


@router.delete("/household/invitations/{invitation_id}", status_code=204)
def revoke(
    invitation_id: uuid.UUID,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> None:
    invitation = find_invitation(db, invitation_id, actor)
    if invitation.status == InvitationStatus.pending:
        invitation.status = InvitationStatus.revoked
    audit(
        db,
        actor,
        actor.household_id,
        "invitation.revoked",
        "invitation",
        invitation.id,
        "Revoked invitation.",
    )
    db.commit()


@router.post("/household/invitations/{invitation_id}/acceptance-link")
def acceptance_link(
    invitation_id: uuid.UUID,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    invitation = find_invitation(db, invitation_id, actor)
    if invitation.status != InvitationStatus.pending or invitation.expires_at <= datetime.now(UTC):
        raise ApiError(410, "INVITATION_UNAVAILABLE", "The invitation is unavailable.")
    secret = opaque_secret()
    invitation.token_hash = hash_secret(secret)
    audit(
        db,
        actor,
        actor.household_id,
        "invitation.link_rotated",
        "invitation",
        invitation.id,
        "Rotated invitation acceptance link.",
    )
    db.commit()
    return {"acceptanceUrl": f"{get_settings().frontend_url}/invite/{secret}"}


def invitation_by_token(token: str, db: Session, lock: bool = False) -> Invitation:
    query = select(Invitation).where(Invitation.token_hash == hash_secret(token))
    invitation = db.scalar(query.with_for_update() if lock else query)
    if not invitation:
        raise ApiError(404, "NOT_FOUND", "Invitation not found.")
    return invitation


@router.get("/invitations/{token}")
def inspect_invitation(
    token: str, request: Request, db: Session = Depends(get_db)
) -> dict[str, object]:
    limited(f"inspect:{request.client.host if request.client else 'unknown'}")
    return invitation_json(invitation_by_token(token, db))


@router.post("/invitations/{token}/accept")
def accept_invitation(
    token: str,
    body: AcceptInvitation,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    limited(f"accept:{request.client.host if request.client else 'unknown'}", 10)
    invitation = invitation_by_token(token, db, True)
    now = datetime.now(UTC)
    if invitation.status != InvitationStatus.pending or invitation.expires_at <= now:
        raise ApiError(
            410, "INVITATION_UNAVAILABLE", "The invitation is expired, revoked, or already used."
        )
    if db.scalar(select(User.id).where(User.email == invitation.email)):
        raise ApiError(409, "DUPLICATE", "An account already uses this email.")
    user = User(
        email=invitation.email, name=body.name.strip(), password_hash=passwords.hash(body.password)
    )
    db.add(user)
    db.flush()
    member = Membership(
        household_id=invitation.household_id,
        user_id=user.id,
        role=invitation.proposed_role,
        status="active",
        joined_at=now,
        user=user,
    )
    db.add(member)
    db.flush()
    db.add(
        DietaryProfile(
            membership_id=member.id,
            dietary_patterns=[],
            allergens=[],
            excluded_ingredients=[],
            preferences="",
            updated_at=now,
        )
    )
    invitation.status, invitation.accepted_at = InvitationStatus.accepted, now
    set_refresh(response, db, user.id)
    audit(
        db,
        member,
        member.household_id,
        "invitation.accepted",
        "invitation",
        invitation.id,
        "Accepted invitation.",
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApiError(
            409,
            "DUPLICATE",
            "The invitation could not be accepted because the account already exists.",
        ) from None
    return auth_json(member)


@router.get("/bootstrap")
def bootstrap(
    member: Membership = Depends(current_membership), db: Session = Depends(get_db)
) -> dict[str, object]:
    household = db.get(Household, member.household_id)
    assert household
    memberships = list(
        db.scalars(
            select(Membership)
            .where(Membership.household_id == member.household_id, Membership.status == "active")
            .order_by(Membership.joined_at)
        )
    )
    ids = [x.id for x in memberships]
    profiles = list(db.scalars(select(DietaryProfile).where(DietaryProfile.membership_id.in_(ids))))
    invitations = (
        list(db.scalars(select(Invitation).where(Invitation.household_id == member.household_id)))
        if member.role != Role.member
        else []
    )
    events = list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.household_id == member.household_id)
            .order_by(AuditEvent.timestamp.desc())
            .limit(100)
        )
    )
    return {
        "version": 2,
        "household": household_json(household),
        "members": [member_json(x) for x in memberships],
        "invitations": [invitation_json(x) for x in invitations],
        "dietaryProfiles": [dietary_json(x) for x in profiles],
        "ingredients": [],
        "recipes": [],
        "plans": [],
        "shoppingLists": [],
        "auditEvents": [audit_json(x) for x in events],
    }


def audit_json(e: AuditEvent) -> dict[str, object]:
    value = {
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


@router.get("/audit-events")
def audit_events(
    page_number: int = Query(1, alias="page", ge=1),
    page_size: int = Query(25, alias="pageSize", ge=1, le=100),
    actor_id: uuid.UUID | None = Query(None, alias="actorId"),
    action: str | None = None,
    entity_type: str | None = Query(None, alias="entityType"),
    date_from: datetime | None = Query(None, alias="from"),
    date_to: datetime | None = Query(None, alias="to"),
    member: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    query = select(AuditEvent).where(AuditEvent.household_id == member.household_id)
    if actor_id:
        query = query.where(AuditEvent.actor_id == actor_id)
    if action:
        query = query.where(AuditEvent.action == action)
    if entity_type:
        query = query.where(AuditEvent.entity_type == entity_type)
    if date_from:
        query = query.where(AuditEvent.timestamp >= date_from)
    if date_to:
        query = query.where(AuditEvent.timestamp <= date_to)
    rows = list(
        db.scalars(
            query.order_by(AuditEvent.timestamp.desc())
            .offset((page_number - 1) * page_size)
            .limit(page_size)
        )
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    return page([audit_json(x) for x in rows], page_number, page_size, total)

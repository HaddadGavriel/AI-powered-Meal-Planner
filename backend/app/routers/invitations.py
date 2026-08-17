import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api_support import (
    audit,
    auth_json,
    current_membership,
    elevated,
    expire_invitations,
    find_invitation,
    invitation_json,
    limited,
    set_refresh,
)
from app.config import get_settings
from app.database import get_db
from app.errors import ApiError
from app.models import (
    DietaryProfile,
    Invitation,
    InvitationStatus,
    Membership,
    Role,
    User,
)
from app.schemas import (
    AcceptanceLinkResponse,
    AcceptInvitation,
    AuthResponse,
    InvitationCreate,
    InvitationPageResponse,
    InvitationResponse,
    page,
)
from app.security import (
    hash_secret,
    normalize_email,
    opaque_secret,
    passwords,
)

router = APIRouter()


@router.post(
    "/household/invitations",
    status_code=201,
    response_model=InvitationResponse,
    response_model_exclude_none=True,
)
def create_invitation(
    body: InvitationCreate,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    elevated(actor)
    email = normalize_email(str(body.email))
    now = datetime.now(UTC)
    expire_invitations(db, actor.household_id)
    existing_account = db.scalar(select(User.id).where(User.email == email))
    pending = db.scalar(
        select(Invitation.id).where(
            Invitation.household_id == actor.household_id,
            Invitation.email == email,
            Invitation.status == InvitationStatus.pending,
            Invitation.expires_at > now,
        )
    )
    if existing_account or pending:
        raise ApiError(
            409, "DUPLICATE", "That email already has an account or a pending invitation."
        )
    invitation = Invitation(
        household_id=actor.household_id,
        email=email,
        proposed_role=Role(body.proposedRole),
        invited_by=actor.id,
        token_hash=hash_secret(opaque_secret()),
        created_at=now,
        expires_at=now + timedelta(days=get_settings().invitation_days),
        status=InvitationStatus.pending,
    )
    db.add(invitation)
    db.flush()
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


@router.get(
    "/household/invitations",
    response_model=InvitationPageResponse,
    response_model_exclude_none=True,
)
def list_invitations(
    page_number: int = Query(1, alias="page", ge=1),
    page_size: int = Query(25, alias="pageSize", ge=1, le=100),
    status: InvitationStatus | None = None,
    search: str | None = None,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    elevated(actor)
    expire_invitations(db, actor.household_id)
    db.commit()
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


@router.post(
    "/household/invitations/{invitation_id}/resend",
    response_model=InvitationResponse,
    response_model_exclude_none=True,
)
def resend(
    invitation_id: uuid.UUID,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    invitation = find_invitation(db, invitation_id, actor)
    expire_invitations(db, actor.household_id)
    db.refresh(invitation)
    if invitation.status != InvitationStatus.pending:
        db.commit()
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
    expire_invitations(db, actor.household_id)
    db.refresh(invitation)
    if invitation.status != InvitationStatus.pending:
        db.commit()
        raise ApiError(410, "INVITATION_UNAVAILABLE", "The invitation is no longer pending.")
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


@router.post(
    "/household/invitations/{invitation_id}/acceptance-link",
    response_model=AcceptanceLinkResponse,
)
def acceptance_link(
    invitation_id: uuid.UUID,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    invitation = find_invitation(db, invitation_id, actor)
    expire_invitations(db, actor.household_id)
    db.refresh(invitation)
    if invitation.status != InvitationStatus.pending or invitation.expires_at <= datetime.now(UTC):
        db.commit()
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


@router.get(
    "/invitations/{token}", response_model=InvitationResponse, response_model_exclude_none=True
)
def inspect_invitation(
    token: str, request: Request, db: Session = Depends(get_db)
) -> dict[str, object]:
    limited(f"inspect:{request.client.host if request.client else 'unknown'}")
    invitation = invitation_by_token(token, db)
    expire_invitations(db, invitation.household_id)
    db.refresh(invitation)
    db.commit()
    return invitation_json(invitation)


@router.post("/invitations/{token}/accept", response_model=AuthResponse)
def accept_invitation(
    token: str,
    body: AcceptInvitation,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    limited(f"accept:{request.client.host if request.client else 'unknown'}", 10)
    invitation = invitation_by_token(token, db, True)
    expire_invitations(db, invitation.household_id)
    db.refresh(invitation)
    now = datetime.now(UTC)
    if invitation.status != InvitationStatus.pending or invitation.expires_at <= now:
        db.commit()
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

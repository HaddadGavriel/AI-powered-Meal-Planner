import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api_support import (
    audit,
    current_membership,
    dietary_json,
    elevated,
    household_json,
    member_json,
)
from app.database import get_db
from app.errors import ApiError
from app.models import (
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
    DietaryInput,
    DietaryProfileResponse,
    HouseholdPatch,
    HouseholdResponse,
    MemberPageResponse,
    MemberResponse,
    RolePatch,
    UserPatch,
    page,
)
from app.security import (
    normalize_email,
)

router = APIRouter()


@router.get("/users/me", response_model=MemberResponse)
def me(member: Membership = Depends(current_membership)) -> dict[str, object]:
    return member_json(member)


@router.patch("/users/me", response_model=MemberResponse)
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


@router.patch("/household", response_model=HouseholdResponse, response_model_exclude_none=True)
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


@router.get("/household/members", response_model=MemberPageResponse)
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


@router.put("/household/members/{member_id}/dietary-profile", response_model=DietaryProfileResponse)
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


@router.patch("/household/members/{member_id}", response_model=MemberResponse)
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
    now = datetime.now(UTC)
    for refresh_session in db.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == target.user_id, RefreshSession.revoked_at.is_(None)
        )
    ):
        refresh_session.revoked_at = now
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

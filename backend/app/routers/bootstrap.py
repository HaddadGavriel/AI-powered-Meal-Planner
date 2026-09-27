from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api_support import (
    build_member_response,
    current_membership,
    expire_invitations,
)
from app.database import get_db
from app.models import (
    AuditEvent,
    DietaryProfile,
    Household,
    Invitation,
    Membership,
    Role,
)
from app.schemas import (
    BootstrapResponse,
)

router = APIRouter()


@router.get("/bootstrap", response_model=BootstrapResponse, response_model_exclude_none=True)
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
    expire_invitations(db, member.household_id)
    db.commit()
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
        "household": household,
        "members": [build_member_response(x) for x in memberships],
        "invitations": invitations,
        "dietary_profiles": profiles,
        "ingredients": [],
        "recipes": [],
        "plans": [],
        "shopping_lists": [],
        "audit_events": events,
    }

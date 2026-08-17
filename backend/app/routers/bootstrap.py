from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api_support import (
    audit_json,
    current_membership,
    dietary_json,
    household_json,
    invitation_json,
    member_json,
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

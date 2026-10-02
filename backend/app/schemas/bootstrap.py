from typing import Any, Literal

from pydantic import BaseModel

from app.schemas.audit import AuditEventResponse
from app.schemas.dietary import DietaryProfileResponse
from app.schemas.households import HouseholdResponse
from app.schemas.invitations import InvitationResponse
from app.schemas.users import MemberResponse


class BootstrapResponse(BaseModel):
    version: Literal[2]
    household: HouseholdResponse
    members: list[MemberResponse]
    invitations: list[InvitationResponse]
    dietary_profiles: list[DietaryProfileResponse]
    ingredients: list[dict[str, Any]]
    recipes: list[dict[str, Any]]
    plans: list[dict[str, Any]]
    shopping_lists: list[dict[str, Any]]
    audit_events: list[AuditEventResponse]

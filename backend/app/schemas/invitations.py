from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import OrmResponse, PageResponse, normalized_name


class AcceptInvitation(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=256)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return normalized_name(value)


class InvitationCreate(BaseModel):
    email: EmailStr
    proposed_role: Literal["administrator", "member"]


class InvitationResponse(OrmResponse):
    id: UUID
    household_id: UUID
    email: EmailStr
    proposed_role: Literal["administrator", "member"]
    invited_by: UUID
    created_at: datetime
    expires_at: datetime
    status: Literal["pending", "accepted", "expired", "revoked"]
    accepted_at: datetime | None = None


class AcceptanceLinkResponse(BaseModel):
    acceptance_url: str


class InvitationPageResponse(PageResponse):
    items: list[InvitationResponse]

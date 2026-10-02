from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import PageResponse, normalized_name

RoleValue = Literal["owner", "administrator", "member"]


class UserPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    email: EmailStr | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        return normalized_name(value) if value is not None else None


class RolePatch(BaseModel):
    role: Literal["owner", "administrator", "member"]


class MemberResponse(BaseModel):
    id: UUID
    name: str = Field(min_length=2)
    email: EmailStr
    avatar_initials: str = Field(min_length=1, max_length=4)
    role: RoleValue
    status: Literal["active", "inactive"]
    joined_at: datetime


class MemberPageResponse(PageResponse):
    items: list[MemberResponse]

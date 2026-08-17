from datetime import datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

RoleValue = Literal["owner", "administrator", "member"]


def normalized_name(value: str) -> str:
    value = value.strip()
    if len(value) < 2:
        raise ValueError("Name must contain at least two non-whitespace characters.")
    return value


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class AcceptInvitation(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=256)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return normalized_name(value)


class UserPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    email: EmailStr | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        return normalized_name(value) if value is not None else None


class HouseholdPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    timezone: str | None = None
    defaultServings: int | None = Field(None, gt=0)
    notes: str | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        return normalized_name(value) if value is not None else None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as error:
            raise ValueError("Use a valid IANA timezone.") from error
        return value


class RolePatch(BaseModel):
    role: Literal["owner", "administrator", "member"]


class DietaryInput(BaseModel):
    dietaryPatterns: list[str]
    allergens: list[str]
    excludedIngredients: list[str]
    preferences: str


class InvitationCreate(BaseModel):
    email: EmailStr
    proposedRole: Literal["administrator", "member"]


class MemberResponse(BaseModel):
    id: str
    name: str = Field(min_length=2)
    email: EmailStr
    avatarInitials: str = Field(min_length=1, max_length=4)
    role: RoleValue
    status: Literal["active", "inactive"]
    joinedAt: datetime


class HouseholdResponse(BaseModel):
    id: str
    name: str = Field(min_length=2)
    timezone: str
    defaultServings: int = Field(gt=0)
    notes: str | None = None
    updatedAt: datetime


class DietaryProfileResponse(BaseModel):
    id: str
    memberId: str
    dietaryPatterns: list[str]
    allergens: list[str]
    excludedIngredients: list[str]
    preferences: str
    updatedAt: datetime


class InvitationResponse(BaseModel):
    id: str
    householdId: str
    email: EmailStr
    proposedRole: Literal["administrator", "member"]
    invitedBy: str
    createdAt: datetime
    expiresAt: datetime
    status: Literal["pending", "accepted", "expired", "revoked"]
    acceptedAt: datetime | None = None


class AuditEventResponse(BaseModel):
    id: str
    actorId: str | None = None
    action: str
    entityType: str
    entityId: str
    timestamp: datetime
    summary: str


class AuthResponse(BaseModel):
    accessToken: str
    expiresAt: datetime
    user: MemberResponse


class AcceptanceLinkResponse(BaseModel):
    acceptanceUrl: str


class PageResponse(BaseModel):
    page: int
    pageSize: int
    totalItems: int
    totalPages: int


class MemberPageResponse(PageResponse):
    items: list[MemberResponse]


class InvitationPageResponse(PageResponse):
    items: list[InvitationResponse]


class AuditPageResponse(PageResponse):
    items: list[AuditEventResponse]


class BootstrapResponse(BaseModel):
    version: Literal[2]
    household: HouseholdResponse
    members: list[MemberResponse]
    invitations: list[InvitationResponse]
    dietaryProfiles: list[DietaryProfileResponse]
    ingredients: list[dict[str, Any]]
    recipes: list[dict[str, Any]]
    plans: list[dict[str, Any]]
    shoppingLists: list[dict[str, Any]]
    auditEvents: list[AuditEventResponse]


class PageParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(25, ge=1, le=100, alias="pageSize")
    model_config = ConfigDict(populate_by_name=True)


def page(items: list[object], page_number: int, page_size: int, total: int) -> dict[str, object]:
    return {
        "items": items,
        "page": page_number,
        "pageSize": page_size,
        "totalItems": total,
        "totalPages": (total + page_size - 1) // page_size,
    }


def iso(value: datetime) -> str:
    return value.isoformat().replace("+00:00", "Z")

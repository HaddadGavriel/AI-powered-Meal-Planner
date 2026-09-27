from collections.abc import Sequence
from datetime import datetime
from typing import Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

RoleValue = Literal["owner", "administrator", "member"]
IngredientCategoryValue = Literal["Produce", "Meat and poultry", "Seafood", "Dairy", "Grains", "Legumes", "Spices", "Condiments", "Baking", "Other"]
IngredientUnitValue = Literal["grams", "kilograms", "milliliters", "liters", "units"]
IngredientStatusValue = Literal["active", "archived"]


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
    default_servings: int | None = Field(None, gt=0)
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

    @field_validator("name", "timezone", "default_servings", mode="before")
    @classmethod
    def reject_null(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("This field cannot be null.")
        return value


class RolePatch(BaseModel):
    role: Literal["owner", "administrator", "member"]


class DietaryInput(BaseModel):
    dietary_patterns: list[str]
    allergens: list[str]
    excluded_ingredients: list[str]
    preferences: str


class InvitationCreate(BaseModel):
    email: EmailStr
    proposed_role: Literal["administrator", "member"]


class OrmResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MemberResponse(BaseModel):
    id: UUID
    name: str = Field(min_length=2)
    email: EmailStr
    avatar_initials: str = Field(min_length=1, max_length=4)
    role: RoleValue
    status: Literal["active", "inactive"]
    joined_at: datetime


class HouseholdResponse(OrmResponse):
    id: UUID
    name: str = Field(min_length=2)
    timezone: str
    default_servings: int = Field(gt=0)
    notes: str | None = None
    updated_at: datetime


class DietaryProfileResponse(OrmResponse):
    id: UUID
    membership_id: UUID
    dietary_patterns: list[str]
    allergens: list[str]
    excluded_ingredients: list[str]
    preferences: str
    updated_at: datetime


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


class AuditEventResponse(OrmResponse):
    id: UUID
    actor_id: UUID | None = None
    action: str
    entity_type: str
    entity_id: str
    timestamp: datetime
    summary: str


class AuthResponse(BaseModel):
    access_token: str
    expires_at: datetime
    user: MemberResponse


class AcceptanceLinkResponse(BaseModel):
    acceptance_url: str


class PageResponse(BaseModel):
    page: int
    page_size: int
    total_items: int
    total_pages: int


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
    dietary_profiles: list[DietaryProfileResponse]
    ingredients: list[dict[str, Any]]
    recipes: list[dict[str, Any]]
    plans: list[dict[str, Any]]
    shopping_lists: list[dict[str, Any]]
    audit_events: list[AuditEventResponse]


class PageParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(25, ge=1, le=100)


def page(
    items: Sequence[object], page_number: int, page_size: int, total: int
) -> dict[str, object]:
    return {
        "items": items,
        "page": page_number,
        "page_size": page_size,
        "total_items": total,
        "total_pages": (total + page_size - 1) // page_size,
    }


class IngredientCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: IngredientCategoryValue
    default_unit: IngredientUnitValue
    status: IngredientStatusValue = "active"
    allergens: list[str] = Field(default_factory=list)
    notes: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        return normalized_name(value).title()


class IngredientPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    category: IngredientCategoryValue | None = None
    default_unit: IngredientUnitValue | None = None
    status: IngredientStatusValue | None = None
    allergens: list[str] | None = None
    notes: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Name cannot be null.")

        if not isinstance(value, str):
            return value

        return normalized_name(value).title()

    @field_validator("category", "default_unit", "status", "allergens", mode="before")
    @classmethod
    def reject_null(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("This field cannot be null.")
        return value


class IngredientResponse(IngredientCreate):
    id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

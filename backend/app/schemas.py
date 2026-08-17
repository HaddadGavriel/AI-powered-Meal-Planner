from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class AcceptInvitation(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=256)


class UserPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    email: EmailStr | None = None


class HouseholdPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    timezone: str | None = None
    defaultServings: int | None = Field(None, gt=0)
    notes: str | None = None


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

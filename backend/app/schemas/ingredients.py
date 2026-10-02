from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.common import PageResponse, normalized_name

IngredientCategoryValue = Literal[
    "Produce",
    "Meat and poultry",
    "Seafood",
    "Dairy",
    "Grains",
    "Legumes",
    "Spices",
    "Condiments",
    "Baking",
    "Other",
]
IngredientStatusValue = Literal["active", "archived"]


def normalized_unit(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Default unit cannot be empty")
    return value


class IngredientCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    category: IngredientCategoryValue
    default_unit: str = Field(min_length=1, max_length=120)
    status: IngredientStatusValue = "active"
    allergens: list[str] = Field(default_factory=list)
    notes: str = ""

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        return normalized_name(value).title()

    @field_validator("default_unit", mode="before")
    @classmethod
    def normalize_unit(cls, value: str) -> str:
        if not isinstance(value, str):
            return value

        return normalized_unit(value)


class IngredientPatch(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    category: IngredientCategoryValue | None = None
    default_unit: str | None = Field(None, min_length=1, max_length=120)
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

    @field_validator("default_unit", mode="before")
    @classmethod
    def normalize_unit(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Default unit cannot be null.")

        if not isinstance(value, str):
            return value

        return normalized_unit(value)

    @field_validator("category", "status", "allergens", "notes", mode="before")
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


class IngredientPageResponse(PageResponse):
    items: list[IngredientResponse]

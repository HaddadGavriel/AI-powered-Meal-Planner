from datetime import datetime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import OrmResponse, normalized_name


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


class HouseholdResponse(OrmResponse):
    id: UUID
    name: str = Field(min_length=2)
    timezone: str
    default_servings: int = Field(gt=0)
    notes: str | None = None
    updated_at: datetime

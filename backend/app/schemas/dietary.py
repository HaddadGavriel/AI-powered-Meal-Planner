from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.common import OrmResponse


class DietaryInput(BaseModel):
    dietary_patterns: list[str]
    allergens: list[str]
    excluded_ingredients: list[str]
    preferences: str


class DietaryProfileResponse(OrmResponse):
    id: UUID
    membership_id: UUID
    dietary_patterns: list[str]
    allergens: list[str]
    excluded_ingredients: list[str]
    preferences: str
    updated_at: datetime

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.common import uuid4


class IngredientCategory(enum.StrEnum):
    produce = "Produce"
    meat_and_poultry = "Meat and poultry"
    seafood = "Seafood"
    dairy = "Dairy"
    grains = "Grains"
    legumes = "Legumes"
    spices = "Spices"
    condiments = "Condiments"
    baking = "Baking"
    other = "Other"


class IngredientStatus(enum.StrEnum):
    active = "active"
    archived = "archived"


class Ingredient(Base):
    __tablename__ = "ingredients"

    __table_args__ = (
        Index(
            "uq_ingredient_household_name_ci",
            "household_id", text("lower(name)"),
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"))

    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[IngredientCategory] = mapped_column(
        Enum(IngredientCategory, name="ingredient_category")
    )
    status: Mapped[IngredientStatus] = mapped_column(
        Enum(IngredientStatus, name="ingredient_status"), default=IngredientStatus.active
    )
    default_unit: Mapped[str] = mapped_column(String(120))
    allergens: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

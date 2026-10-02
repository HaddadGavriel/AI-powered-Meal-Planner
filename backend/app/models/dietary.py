import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.common import uuid4


class DietaryProfile(Base):
    __tablename__ = "dietary_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    membership_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("memberships.id", ondelete="CASCADE"), unique=True
    )

    dietary_patterns: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    allergens: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    excluded_ingredients: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    preferences: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

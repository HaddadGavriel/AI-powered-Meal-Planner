import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.common import uuid4
from app.models.users import Role


class InvitationStatus(enum.StrEnum):
    pending = "pending"
    accepted = "accepted"
    expired = "expired"
    revoked = "revoked"


class Invitation(Base):
    __tablename__ = "invitations"

    __table_args__ = (
        Index(
            "uq_pending_invitation",
            "household_id",
            "email",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("households.id", ondelete="CASCADE"), index=True
    )

    email: Mapped[str] = mapped_column(String(320))
    proposed_role: Mapped[Role] = mapped_column(Enum(Role, name="role", create_type=False))
    invited_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[InvitationStatus] = mapped_column(
        Enum(InvitationStatus, name="invitation_status")
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

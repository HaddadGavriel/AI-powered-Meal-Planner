"""Create supporting identity, household, invitation, session, dietary and audit tables."""

from alembic import op
from app import models  # noqa: F401
from app.database import Base

revision = "0001_supporting_foundation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=False)


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), checkfirst=False)

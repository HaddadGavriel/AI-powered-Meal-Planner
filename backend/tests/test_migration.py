import re
from pathlib import Path


def test_initial_migration_is_independent_of_orm_metadata() -> None:
    migration = (
        Path(__file__).parents[1] / "alembic/versions/0001_supporting_foundation.py"
    ).read_text()
    assert "Base.metadata" not in migration
    assert "create_all" not in migration
    assert "drop_all" not in migration
    assert "app.models" not in migration
    assert "op.create_table" in migration
    # This immutable snapshot is unaffected when future ORM models are added.
    assert set(re.findall(r'op\.create_table\(\n\s+"([^"]+)"', migration)) == {
        "households",
        "users",
        "memberships",
        "dietary_profiles",
        "refresh_sessions",
        "invitations",
        "audit_events",
    }

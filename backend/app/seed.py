import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from app.database import SessionLocal
from app.models import DietaryProfile, Household, Membership, Role, User
from app.security import passwords

DEMO_PASSWORD = "mealplanner-demo"
SEED_HOUSEHOLD_ID = uuid.UUID("00000000-0000-0000-0000-000000000101")


@dataclass(frozen=True)
class SeedAccount:
    user_id: uuid.UUID
    membership_id: uuid.UUID
    dietary_profile_id: uuid.UUID
    email: str
    name: str
    role: Role


SEED_ACCOUNTS = (
    SeedAccount(
        uuid.UUID("00000000-0000-0000-0000-000000000201"),
        uuid.UUID("00000000-0000-0000-0000-000000000301"),
        uuid.UUID("00000000-0000-0000-0000-000000000401"),
        "owner@mealplanner.dev",
        "Avery Stone",
        Role.owner,
    ),
    SeedAccount(
        uuid.UUID("00000000-0000-0000-0000-000000000202"),
        uuid.UUID("00000000-0000-0000-0000-000000000302"),
        uuid.UUID("00000000-0000-0000-0000-000000000402"),
        "admin@mealplanner.dev",
        "Morgan Lee",
        Role.administrator,
    ),
    SeedAccount(
        uuid.UUID("00000000-0000-0000-0000-000000000203"),
        uuid.UUID("00000000-0000-0000-0000-000000000303"),
        uuid.UUID("00000000-0000-0000-0000-000000000403"),
        "member@mealplanner.dev",
        "Jamie Rivera",
        Role.member,
    ),
)


def seed() -> None:
    """Create missing development records without modifying records that already exist."""
    now = datetime.now(UTC)
    with SessionLocal() as db:
        household = db.get(Household, SEED_HOUSEHOLD_ID)
        if not household:
            household = Household(
                id=SEED_HOUSEHOLD_ID,
                name="Green Table Household",
                timezone="America/New_York",
                default_servings=4,
                notes="Development household.",
                updated_at=now,
            )
            db.add(household)
            db.flush()

        for record in SEED_ACCOUNTS:
            user = db.get(User, record.user_id)
            if not user:
                user = User(
                    id=record.user_id,
                    email=record.email,
                    name=record.name,
                    password_hash=passwords.hash(DEMO_PASSWORD),
                )
                db.add(user)
                db.flush()

            membership = db.get(Membership, record.membership_id)
            if not membership:
                membership = Membership(
                    id=record.membership_id,
                    household_id=household.id,
                    user_id=user.id,
                    role=record.role,
                    status="active",
                    joined_at=now,
                    user=user,
                )
                db.add(membership)
                db.flush()

            profile = db.get(DietaryProfile, record.dietary_profile_id)
            if not profile:
                db.add(
                    DietaryProfile(
                        id=record.dietary_profile_id,
                        membership_id=membership.id,
                        dietary_patterns=[],
                        allergens=[],
                        excluded_ingredients=[],
                        preferences="",
                        updated_at=now,
                    )
                )
        db.commit()


def main() -> None:
    seed()
    print("Development household is ready (no core meal-planning data was seeded).")


if __name__ == "__main__":
    main()

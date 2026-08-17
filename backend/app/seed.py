from datetime import UTC, datetime

from sqlalchemy import select

from app.database import SessionLocal
from app.models import DietaryProfile, Household, Membership, Role, User
from app.security import passwords

DEMO_PASSWORD = "mealplanner-demo"
USERS = [
    ("owner@mealplanner.dev", "Avery Stone", Role.owner),
    ("admin@mealplanner.dev", "Morgan Lee", Role.administrator),
    ("member@mealplanner.dev", "Jamie Rivera", Role.member),
]
OWNER_EMAIL = USERS[0][0]


def seed() -> None:
    now = datetime.now(UTC)
    with SessionLocal() as db:
        owner = db.scalar(select(User).where(User.email == OWNER_EMAIL))
        owner_membership = (
            db.scalar(select(Membership).where(Membership.user_id == owner.id)) if owner else None
        )
        household = db.get(Household, owner_membership.household_id) if owner_membership else None
        # The name lookup is only a first-run/recovery fallback. Once the owner
        # has a retained membership, that stable relationship is authoritative.
        if not household and not owner_membership:
            household = db.scalar(
                select(Household).where(Household.name == "Green Table Household")
            )
        if not household:
            household = Household(
                name="Green Table Household",
                timezone="America/New_York",
                default_servings=4,
                notes="Development household.",
                updated_at=now,
            )
            db.add(household)
            db.flush()
        for email, name, role in USERS:
            user = db.scalar(select(User).where(User.email == email))
            if not user:
                user = User(email=email, name=name, password_hash=passwords.hash(DEMO_PASSWORD))
                db.add(user)
                db.flush()
            member = db.scalar(select(Membership).where(Membership.user_id == user.id))
            if not member:
                member = Membership(
                    household_id=household.id,
                    user_id=user.id,
                    role=role,
                    status="active",
                    joined_at=now,
                    user=user,
                )
                db.add(member)
                db.flush()
            elif member.household_id != household.id:
                raise RuntimeError(f"Seed account {email} already belongs to another household.")
            if not db.scalar(
                select(DietaryProfile).where(DietaryProfile.membership_id == member.id)
            ):
                db.add(
                    DietaryProfile(
                        membership_id=member.id,
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

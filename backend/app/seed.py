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


def seed() -> None:
    now = datetime.now(UTC)
    with SessionLocal() as db:
        household = db.scalar(select(Household).where(Household.name == "Green Table Household"))
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
            member = db.scalar(
                select(Membership).where(
                    Membership.household_id == household.id, Membership.user_id == user.id
                )
            )
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

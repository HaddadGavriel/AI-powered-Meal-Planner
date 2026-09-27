
from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api_support import ApiError, audit, current_membership, elevated
from app.database import get_db
from app.models import Ingredient, IngredientCategory, IngredientStatus, IngredientUnit, Membership
from app.schemas import IngredientCreate, IngredientResponse

router = APIRouter(prefix="/ingredients")


@router.post("", response_model=IngredientResponse, status_code=201)
def create_ingredient(
    body: IngredientCreate,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> Ingredient:
    elevated(actor)
    existing_ingredient = db.scalar(
        select(Ingredient.id).where(
            Ingredient.household_id == actor.household_id,
            func.lower(Ingredient.name) == body.name.lower(),
        )
    )

    if existing_ingredient:
        raise ApiError(409, "DUPLICATE", "That ingredient name already exists in this household")

    ing = Ingredient(
        household_id=actor.household_id,
        name=body.name,
        category=IngredientCategory(body.category),
        status=IngredientStatus(body.status),
        default_unit=IngredientUnit(body.default_unit),
        allergens=body.allergens,
        notes=body.notes,
    )

    try:
        db.add(ing)
        db.flush()
        audit(
            db,
            actor,
            actor.household_id,
            "ingredient.created",
            "ingredient",
            ing.id,
            f"Created ingredient, name: {ing.name}",
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApiError(
            409,
            "DUPLICATE",
            "That ingredient name already exists in this household.",
        ) from None

    return ing

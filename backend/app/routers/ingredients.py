import uuid
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api_support import audit, current_membership, elevated
from app.database import get_db
from app.errors import ApiError
from app.models import Ingredient, IngredientCategory, IngredientStatus, Membership
from app.schemas import IngredientCreate, IngredientResponse, IngredientPatch, page, IngredientPageResponse


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
        default_unit=body.default_unit,
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


@router.patch("/{ingredient_id}", response_model=IngredientResponse, status_code=200)
def update_ingredient(
    ingredient_id: uuid.UUID,
    body: IngredientPatch,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db)
) -> Ingredient:
    elevated(actor)
    existing_ingredient = db.scalar(
        select(Ingredient).where(
            Ingredient.household_id == actor.household_id,
            Ingredient.id == ingredient_id
        )
    )

    if not existing_ingredient:
        raise ApiError(404, "NOT_FOUND", "Ingredient does not exist in this household.")

    fields = body.model_dump(exclude_unset=True)
    for field, value in fields.items():
        if field == "category":
            value = IngredientCategory(value)
        elif field == "status":
            value = IngredientStatus(value)
    
        setattr(existing_ingredient, field, value)

    try:
        audit(db, actor, actor.household_id, "ingredient.updated", "ingredient", existing_ingredient.id, "Updated Ingredient.")
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApiError(
            409,
            "DUPLICATE",
            "That ingredient name already exists in this household.",
        ) from None

    return existing_ingredient


@router.delete("/{ingredient_id}", status_code=204)
def delete_ingredient(
    ingredient_id: uuid.UUID,
    actor: Membership = Depends(current_membership),
    db: Session = Depends(get_db)
) -> None:
    elevated(actor)
    existing_ingredient = db.scalar(
        select(Ingredient).where(
            Ingredient.household_id == actor.household_id,
            Ingredient.id == ingredient_id
        )
    )

    if not existing_ingredient:
        raise ApiError(404, "NOT_FOUND", "Ingredient does not exist in this household.")

    try:
        db.delete(existing_ingredient)
        audit(db, actor, actor.household_id, "ingredient.deleted", "ingredient", existing_ingredient.id, "Deleted Ingredient.")
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ApiError(
            409,
            "CONFLICT",
            "The ingredient could not be deleted because it is in use.",
        ) from None


@router.get("", response_model=IngredientPageResponse)
def get_ingredients(
    page_number: int = Query(1, alias="page", ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str | None = None,
    category: IngredientCategory | None = None,
    status: IngredientStatus | None = IngredientStatus.active,
    member: Membership = Depends(current_membership),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    query = select(Ingredient).where(Ingredient.household_id == member.household_id)
    if category:
        query = query.where(Ingredient.category == category)
    if status:
        query = query.where(Ingredient.status == status)
    if search:
        query = query.where(Ingredient.name.ilike(f"%{search}%"))
    rows = list(
        db.scalars(query.order_by(Ingredient.name).offset((page_number - 1) * page_size).limit(page_size))
    )
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    return page(rows, page_number, page_size, total)


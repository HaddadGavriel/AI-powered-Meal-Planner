from tests.helpers import login

from app.database import SessionLocal
from app.seed import SEED_HOUSEHOLD_ID
from app.models import Ingredient, IngredientCategory, IngredientStatus

from fastapi.testclient import TestClient

BASE_URL = "/api/v1/ingredients"

def test_create_ingredient(client: TestClient):
    owner_headers = login(client)
    body = {
        "name": "potato",
        "category": "Produce",
        "default_unit": "grams"
    }

    response = client.post(BASE_URL, headers=owner_headers, json=body)
    assert response.status_code == 201

    data = response.json()

    assert data["name"] == "Potato"
    assert data["category"] == "Produce"
    assert data["default_unit"] == "grams"
    assert data["status"] == "active"
    assert data["allergens"] == []
    assert data["notes"] == ""
    assert data["created_at"] is not None
    assert data["updated_at"] is not None

    with SessionLocal() as db:
        ing = db.get(Ingredient, data["id"])

    assert ing is not None
    assert ing.household_id == SEED_HOUSEHOLD_ID
    assert ing.name == "Potato"
    assert ing.category == IngredientCategory.produce
    assert ing.default_unit == "grams"
    assert ing.status == IngredientStatus.active
    assert ing.allergens == []
    assert ing.notes == ""
    assert ing.created_at is not None
    assert ing.updated_at is not None

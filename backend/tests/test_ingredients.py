from tests.helpers import login

from app.database import SessionLocal
from app.models import Ingredient

from fastapi.testclient import TestClient

BASE_URL = r"/api/v1/ingredients"

def test_create_ingredient(client: TestClient):
    owner_headers = login(client)
    body = {
        "name": "potato",
        "category": "Produce",
        "default_unit": "grams"
    }

    response = client.post(BASE_URL, headers=owner_headers, json=body)

    assert response.status_code == 201

    ing = None
    with SessionLocal() as db:
        ing = db.get(Ingredient, response.json()["id"])

    assert ing is not None
    assert ing.name == "Potato"
    assert ing.category == "Produce"
    assert ing.default_unit == "grams"
    assert ing.status == "active"
    assert ing.allergens == []
    assert ing.notes == ""
    assert ing.created_at is not None
    assert ing.updated_at is not None

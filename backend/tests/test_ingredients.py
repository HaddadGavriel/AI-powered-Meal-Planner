import uuid
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import (
    AuditEvent,
    Household,
    Ingredient,
    IngredientCategory,
    IngredientStatus,
    Membership,
)
from app.seed import SEED_HOUSEHOLD_ID
from tests.helpers import login

BASE_URL = "/api/v1/ingredients"
VALID_INGREDIENT = {
    "name": "Carrot",
    "category": "Produce",
    "default_unit": "grams",
}


def create_ingredient(
    client: TestClient,
    headers: dict[str, str],
    *,
    name: str = "Carrot",
    category: str = "Produce",
    default_unit: str = "grams",
    status: str = "active",
) -> dict[str, object]:
    response = client.post(
        BASE_URL,
        headers=headers,
        json={
            "name": name,
            "category": category,
            "default_unit": default_unit,
            "status": status,
        },
    )
    assert response.status_code == 201
    return response.json()


def assert_error(response: object, status_code: int, code: str) -> None:
    assert getattr(response, "status_code") == status_code
    assert getattr(response, "json")()["error"]["code"] == code


def ingredient_count() -> int:
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(Ingredient)) or 0


def test_create_ingredient(client: TestClient) -> None:
    owner_headers = login(client)
    body = {"name": "potato", "category": "Produce", "default_unit": "grams"}

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


def test_administrator_can_create_ingredient(client: TestClient) -> None:
    response = client.post(
        BASE_URL,
        headers=login(client, "admin@mealplanner.dev"),
        json=VALID_INGREDIENT,
    )
    assert response.status_code == 201
    assert ingredient_count() == 1


@pytest.mark.parametrize(
    ("email", "status_code", "code"),
    [("member@mealplanner.dev", 403, "FORBIDDEN"), (None, 401, "UNAUTHENTICATED")],
)
def test_unauthorized_create_does_not_persist(
    client: TestClient, email: str | None, status_code: int, code: str
) -> None:
    headers = login(client, email) if email else {}
    response = client.post(BASE_URL, headers=headers, json=VALID_INGREDIENT)
    assert_error(response, status_code, code)
    assert ingredient_count() == 0


@pytest.mark.parametrize(
    "body",
    [
        {"name": "   ", "category": "Produce", "default_unit": "grams"},
        {"name": "Carrot", "default_unit": "grams"},
        {"name": "Carrot", "category": "produce", "default_unit": "grams"},
        {"name": "Carrot", "category": "Produce"},
        {"name": "Carrot", "category": "Produce", "default_unit": "  "},
        {
            "name": "Carrot",
            "category": "Produce",
            "default_unit": "grams",
            "status": "deleted",
        },
    ],
)
def test_create_validation(client: TestClient, body: dict[str, object]) -> None:
    response = client.post(BASE_URL, headers=login(client), json=body)
    assert response.status_code == 422
    assert ingredient_count() == 0


def test_create_normalizes_name_and_default_unit(client: TestClient) -> None:
    created = create_ingredient(client, login(client), name="  sweet potato  ", default_unit="  large pieces  ")
    assert created["name"] == "Sweet Potato"
    assert created["default_unit"] == "large pieces"


def test_api_rejects_case_insensitive_duplicate_name(client: TestClient) -> None:
    headers = login(client)
    create_ingredient(client, headers, name="Potato")
    response = client.post(BASE_URL, headers=headers, json={**VALID_INGREDIENT, "name": "POTATO"})
    assert_error(response, 409, "DUPLICATE")
    assert ingredient_count() == 1


def test_database_enforces_household_scoped_case_insensitive_names() -> None:
    with SessionLocal() as db:
        db.add(
            Ingredient(
                household_id=SEED_HOUSEHOLD_ID,
                name="Salt",
                category=IngredientCategory.spices,
                default_unit="pinch",
            )
        )
        db.commit()
        db.add(
            Ingredient(
                household_id=SEED_HOUSEHOLD_ID,
                name="salt",
                category=IngredientCategory.spices,
                default_unit="teaspoon",
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        other_household = Household(
            name="Other Household",
            timezone="UTC",
            default_servings=2,
            notes="",
            updated_at=datetime.now(UTC),
        )
        db.add(other_household)
        db.flush()
        db.add(
            Ingredient(
                household_id=other_household.id,
                name="salt",
                category=IngredientCategory.spices,
                default_unit="teaspoon",
            )
        )
        db.commit()
        assert db.scalar(select(func.count()).select_from(Ingredient)) == 2


def test_patch_subset_normalizes_and_preserves_unspecified_fields(client: TestClient) -> None:
    headers = login(client)
    created = client.post(
        BASE_URL,
        headers=headers,
        json={**VALID_INGREDIENT, "allergens": ["initial"], "notes": "original"},
    ).json()
    response = client.patch(
        f"{BASE_URL}/{created['id']}",
        headers=headers,
        json={
            "name": "  sweet POTATO  ",
            "category": "Other",
            "default_unit": "  servings  ",
            "allergens": ["soy"],
            "notes": "Updated notes",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Sweet Potato"
    assert data["category"] == "Other"
    assert data["default_unit"] == "servings"
    assert data["allergens"] == ["soy"]
    assert data["notes"] == "Updated notes"
    assert data["status"] == "active"
    assert data["created_at"] == created["created_at"]
    assert data["updated_at"] is not None

    with SessionLocal() as db:
        ingredient = db.get(Ingredient, created["id"])
        assert ingredient is not None
        assert ingredient.name == "Sweet Potato"
        assert ingredient.category == IngredientCategory.other
        assert ingredient.default_unit == "servings"
        assert ingredient.allergens == ["soy"]
        assert ingredient.notes == "Updated notes"
        assert ingredient.updated_at is not None


def test_administrator_can_patch(client: TestClient) -> None:
    created = create_ingredient(client, login(client))
    response = client.patch(
        f"{BASE_URL}/{created['id']}",
        headers=login(client, "admin@mealplanner.dev"),
        json={"notes": "Admin edit"},
    )
    assert response.status_code == 200
    assert response.json()["notes"] == "Admin edit"


@pytest.mark.parametrize(
    ("email", "status_code", "code"),
    [("member@mealplanner.dev", 403, "FORBIDDEN"), (None, 401, "UNAUTHENTICATED")],
)
def test_unauthorized_patch_does_not_modify(client: TestClient, email: str | None, status_code: int, code: str) -> None:
    created = create_ingredient(client, login(client), name="Potato")
    headers = login(client, email) if email else {}
    response = client.patch(f"{BASE_URL}/{created['id']}", headers=headers, json={"name": "Changed"})
    assert_error(response, status_code, code)
    with SessionLocal() as db:
        ingredient = db.get(Ingredient, created["id"])
        assert ingredient is not None and ingredient.name == "Potato"


@pytest.mark.parametrize("field", ["name", "category", "default_unit", "status", "allergens", "notes"])
def test_patch_rejects_explicit_null(client: TestClient, field: str) -> None:
    headers = login(client)
    created = create_ingredient(client, headers)
    response = client.patch(f"{BASE_URL}/{created['id']}", headers=headers, json={field: None})
    assert response.status_code == 422


@pytest.mark.parametrize(
    "patch",
    [
        {"category": "produce"},
        {"status": "deleted"},
        {"name": "   "},
        {"default_unit": "   "},
    ],
)
def test_patch_rejects_invalid_values(client: TestClient, patch: dict[str, object]) -> None:
    headers = login(client)
    created = create_ingredient(client, headers)
    response = client.patch(f"{BASE_URL}/{created['id']}", headers=headers, json=patch)
    assert response.status_code == 422


def test_duplicate_patch_is_atomic_and_does_not_audit(client: TestClient) -> None:
    headers = login(client)
    potato = create_ingredient(client, headers, name="Potato")
    tomato = create_ingredient(client, headers, name="Tomato")
    response = client.patch(f"{BASE_URL}/{tomato['id']}", headers=headers, json={"name": "POTATO", "notes": "bad"})
    assert_error(response, 409, "DUPLICATE")

    with SessionLocal() as db:
        assert db.get(Ingredient, potato["id"]).name == "Potato"  # type: ignore[union-attr]
        persisted_tomato = db.get(Ingredient, tomato["id"])
        assert persisted_tomato is not None
        assert persisted_tomato.name == "Tomato"
        assert persisted_tomato.notes == ""
        failed_updates = db.scalars(
            select(AuditEvent).where(
                AuditEvent.action == "ingredient.updated",
                AuditEvent.entity_id == str(tomato["id"]),
            )
        ).all()
        assert failed_updates == []


def test_patch_nonexistent_ingredient(client: TestClient) -> None:
    response = client.patch(f"{BASE_URL}/{uuid.uuid4()}", headers=login(client), json={"notes": "missing"})
    assert_error(response, 404, "NOT_FOUND")


def test_archive_hides_ingredient_and_restore_returns_it(client: TestClient) -> None:
    headers = login(client)
    created = create_ingredient(client, headers)
    archived = client.patch(f"{BASE_URL}/{created['id']}", headers=headers, json={"status": "archived"})
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"
    assert created["id"] not in {item["id"] for item in client.get(BASE_URL, headers=headers).json()["items"]}
    archived_items = client.get(f"{BASE_URL}?status=archived", headers=headers).json()["items"]
    assert [item["id"] for item in archived_items] == [created["id"]]
    with SessionLocal() as db:
        assert db.get(Ingredient, created["id"]).status == IngredientStatus.archived  # type: ignore[union-attr]

    restored = client.patch(f"{BASE_URL}/{created['id']}", headers=headers, json={"status": "active"})
    assert restored.status_code == 200
    assert restored.json()["status"] == "active"
    assert created["id"] in {item["id"] for item in client.get(BASE_URL, headers=headers).json()["items"]}


def test_owner_can_delete_ingredient(client: TestClient) -> None:
    headers = login(client)
    created = create_ingredient(client, headers)
    response = client.delete(f"{BASE_URL}/{created['id']}", headers=headers)
    assert response.status_code == 204
    with SessionLocal() as db:
        assert db.get(Ingredient, created["id"]) is None


def test_administrator_can_delete_ingredient(client: TestClient) -> None:
    created = create_ingredient(client, login(client))
    response = client.delete(f"{BASE_URL}/{created['id']}", headers=login(client, "admin@mealplanner.dev"))
    assert response.status_code == 204
    assert ingredient_count() == 0


@pytest.mark.parametrize(
    ("email", "status_code", "code"),
    [("member@mealplanner.dev", 403, "FORBIDDEN"), (None, 401, "UNAUTHENTICATED")],
)
def test_unauthorized_delete_does_not_remove(
    client: TestClient, email: str | None, status_code: int, code: str
) -> None:
    created = create_ingredient(client, login(client))
    headers = login(client, email) if email else {}
    response = client.delete(f"{BASE_URL}/{created['id']}", headers=headers)
    assert_error(response, status_code, code)
    with SessionLocal() as db:
        assert db.get(Ingredient, created["id"]) is not None


def test_delete_nonexistent_ingredient(client: TestClient) -> None:
    response = client.delete(f"{BASE_URL}/{uuid.uuid4()}", headers=login(client))
    assert_error(response, 404, "NOT_FOUND")


@pytest.mark.parametrize("email", ["owner@mealplanner.dev", "admin@mealplanner.dev", "member@mealplanner.dev"])
def test_household_members_can_list_ingredients(client: TestClient, email: str) -> None:
    response = client.get(BASE_URL, headers=login(client, email))
    assert response.status_code == 200


def test_unauthenticated_user_cannot_list_ingredients(client: TestClient) -> None:
    assert_error(client.get(BASE_URL), 401, "UNAUTHENTICATED")


def test_default_and_explicit_status_filters(client: TestClient) -> None:
    headers = login(client)
    active = create_ingredient(client, headers, name="Active Apple")
    archived = create_ingredient(client, headers, name="Archived Apple", status="archived")
    default_items = client.get(BASE_URL, headers=headers).json()["items"]
    assert [item["id"] for item in default_items] == [active["id"]]
    archived_items = client.get(f"{BASE_URL}?status=archived", headers=headers).json()["items"]
    assert [item["id"] for item in archived_items] == [archived["id"]]


def test_category_filter_uses_public_values(client: TestClient) -> None:
    headers = login(client)
    produce = create_ingredient(client, headers, name="Apple", category="Produce")
    create_ingredient(client, headers, name="Milk", category="Dairy")
    response = client.get(f"{BASE_URL}?category=Produce", headers=headers)
    assert response.status_code == 200
    assert [item["id"] for item in response.json()["items"]] == [produce["id"]]


def test_search_is_partial_case_insensitive_and_excludes_nonmatches(client: TestClient) -> None:
    headers = login(client)
    potato = create_ingredient(client, headers, name="Sweet Potato")
    create_ingredient(client, headers, name="Carrot")
    items = client.get(f"{BASE_URL}?search=POTAT", headers=headers).json()["items"]
    assert [item["id"] for item in items] == [potato["id"]]


def test_pagination_metadata_and_name_ordering(client: TestClient) -> None:
    headers = login(client)
    for name in ["Zulu", "Alpha", "Mike", "Bravo", "Echo"]:
        create_ingredient(client, headers, name=name)
    response = client.get(f"{BASE_URL}?page=2&page_size=2", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["page"] == 2
    assert body["page_size"] == 2
    assert body["total_items"] == 5
    assert body["total_pages"] == 3
    assert len(body["items"]) == 2
    assert [item["name"] for item in body["items"]] == ["Echo", "Mike"]


@pytest.mark.parametrize("query", ["page=0", "page_size=0", "page_size=101"])
def test_invalid_pagination_is_rejected(client: TestClient, query: str) -> None:
    assert client.get(f"{BASE_URL}?{query}", headers=login(client)).status_code == 422


def test_household_isolation_for_reads_and_mutations(client: TestClient) -> None:
    headers = login(client)
    own = create_ingredient(client, headers, name="Visible")
    with SessionLocal() as db:
        other_household = Household(
            name="Private Household",
            timezone="UTC",
            default_servings=4,
            notes="",
            updated_at=datetime.now(UTC),
        )
        db.add(other_household)
        db.flush()
        other = Ingredient(
            household_id=other_household.id,
            name="Secret Ingredient",
            category=IngredientCategory.other,
            default_unit="item",
        )
        db.add(other)
        db.commit()
        other_id = other.id

    items = client.get(BASE_URL, headers=headers).json()["items"]
    assert [item["id"] for item in items] == [own["id"]]
    assert_error(
        client.patch(f"{BASE_URL}/{other_id}", headers=headers, json={"notes": "intrusion"}),
        404,
        "NOT_FOUND",
    )
    assert_error(client.delete(f"{BASE_URL}/{other_id}", headers=headers), 404, "NOT_FOUND")
    with SessionLocal() as db:
        ingredient = db.get(Ingredient, other_id)
        assert ingredient is not None and ingredient.notes == ""


def test_successful_mutations_create_authoritative_audit_events(client: TestClient) -> None:
    headers = login(client)
    created = create_ingredient(client, headers, name="Audited")
    assert client.patch(f"{BASE_URL}/{created['id']}", headers=headers, json={"notes": "changed"}).status_code == 200
    assert client.delete(f"{BASE_URL}/{created['id']}", headers=headers).status_code == 204

    with SessionLocal() as db:
        actor_id = db.scalar(
            select(Membership.id).where(Membership.household_id == SEED_HOUSEHOLD_ID, Membership.role == "owner")
        )
        events = db.scalars(
            select(AuditEvent)
            .where(
                AuditEvent.entity_type == "ingredient",
                AuditEvent.entity_id == str(created["id"]),
            )
            .order_by(AuditEvent.timestamp)
        ).all()
        assert [event.action for event in events] == [
            "ingredient.created",
            "ingredient.updated",
            "ingredient.deleted",
        ]
        assert all(event.household_id == SEED_HOUSEHOLD_ID for event in events)
        assert all(event.actor_id == actor_id for event in events)


def test_failed_create_does_not_commit_audit_event(client: TestClient) -> None:
    headers = login(client)
    create_ingredient(client, headers, name="Potato")
    response = client.post(BASE_URL, headers=headers, json={**VALID_INGREDIENT, "name": "potato"})
    assert_error(response, 409, "DUPLICATE")
    with SessionLocal() as db:
        events = db.scalars(
            select(AuditEvent).where(AuditEvent.action == "ingredient.created", AuditEvent.entity_type == "ingredient")
        ).all()
        assert len(events) == 1

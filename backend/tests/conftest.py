import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

# Tests deliberately require PostgreSQL; there is no SQLite fallback.
os.environ.setdefault(
    "MEAL_PLANNER_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/meal_planner_test",
)
os.environ.setdefault("MEAL_PLANNER_JWT_SECRET", "test-secret-at-least-thirty-two-characters")

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.rate_limit import rate_limiter  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture(autouse=True)
def database():
    # The API limiter intentionally survives requests in production. Tests must
    # isolate that process-local state just as they isolate PostgreSQL state.
    rate_limiter.reset()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seed()
    yield
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(text(f'TRUNCATE TABLE "{table.name}" CASCADE'))
    rate_limiter.reset()


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as value:
        yield value


def login(client: TestClient, email: str = "owner@mealplanner.dev") -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "mealplanner-demo"}
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from dotenv import load_dotenv

load_dotenv()

os.environ["MEAL_PLANNER_DATABASE_URL"] = os.environ[
    "MEAL_PLANNER_TEST_DATABASE_URL"
]
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

# Meal Planner backend

This directory is the deliberately small FastAPI/PostgreSQL supporting backend. `app/models.py`
contains identity, membership, dietary, session, invitation, and audit persistence. `app/routers/`
contains focused auth, household, invitation, bootstrap, and audit routes; `app/api_support.py` holds
only their shared authentication, serialization, and audit helpers. `app/security.py` owns
credentials, and Alembic owns schema changes. Core meal-planning data is behind the explicit
empty-array bootstrap boundary and is listed in `RESERVED_FOR_USER.md`.

## Local setup

Requires Python 3.12 and PostgreSQL 17 (or Docker Compose):

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
alembic upgrade head
meal-planner-seed
uvicorn app.main:app --reload
```

Run commands from `backend/`. The seed is explicit and idempotent. It creates only the documented
owner/admin/member accounts using password `mealplanner-demo`; it never creates core resources.
The installable Python distribution intentionally contains only `app` and its focused router
subpackage; the adjacent `alembic` directory is migration infrastructure loaded from the repository
checkout, not an import package.

Configuration uses `MEAL_PLANNER_` variables shown in the root `.env.example`. Set a long random
`JWT_SECRET`, a PostgreSQL `DATABASE_URL`, `COOKIE_SECURE=true`, the public `FRONTEND_URL`, and exact
comma-separated `CORS_ORIGINS` in production.

## Database and quality commands

```bash
alembic upgrade head
alembic downgrade base
ruff check .
ruff format --check .
mypy app
pytest
```

From the repository root, `docker compose up --build` starts PostgreSQL, migrates the database, and
starts the API on port 8000. Run `docker compose exec api meal-planner-seed` explicitly when desired.

## Authentication and security boundaries

Passwords use Argon2. HS256 access JWTs expire after 15 minutes. Refresh and invitation capabilities
are high-entropy opaque values whose SHA-256 hashes alone are persisted. Refresh credentials rotate
on every use, are revocable, and travel in an HttpOnly SameSite=Lax cookie (Secure when configured).
Acceptance-link requests also rotate invitation capabilities, so every older link immediately stops
working. Email lookup is normalized with Unicode case-folding. The in-process fixed-window limiter is
appropriate for one capstone process only; production/multi-worker deployment should replace it with
a shared proxy/Redis limiter. Actual email delivery, account recovery, MFA, key rotation, session
device management, and durable rate-limit state are intentionally deferred. Logs contain request
metadata, never bodies, authorization headers, cookies, passwords, or capabilities.

Each account has exactly one household membership because the current frontend has no household
selector and access tokens intentionally carry no household context. Removing a member makes that
membership inactive, revokes every active refresh session, and disables login. The historical account
and membership are retained so audit/invitation attribution remains resolvable; an inactive account's
email cannot be invited again. Account reactivation or transfer is intentionally a future explicit
administrative flow rather than an implicit invitation side effect.

Audit events have no write route and are appended in the same transaction as supporting mutations.
Application database credentials should not have UPDATE/DELETE permissions on `audit_events` in a
hardened deployment; the capstone enforces append-only behavior at the application boundary.

## Frontend HTTP mode

Start the frontend with `NEXT_PUBLIC_MEAL_PLANNER_DATA_MODE=http` and
`NEXT_PUBLIC_MEAL_PLANNER_API_URL=http://localhost:8000/api/v1`. Browser credentials remain in an
HttpOnly refresh cookie and the access token remains only in frontend memory. No frontend changes
were required because the API follows `docs/backend-integration.md`.

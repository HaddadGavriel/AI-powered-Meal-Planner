# Meal Planner frontend

A frontend-only household meal-planning demo built with Next.js, React, TypeScript, Tailwind CSS, and Zod. Stage 0 intentionally includes **no backend, database, API routes, server actions, real authentication/email, AI, billing, or medical-safety guarantees**.

## Implemented flows

The app provides simulated role-based sign-in, editable user and dietary profiles, household/member/invitation management, ingredient and recipe CRUD, weekly plans and movable meal entries, deterministic shopping-list generation, audit activity, resilient mock persistence, and light/dark/system themes. Frontend permissions are UX only; a backend must reauthorize every request.

## Architecture

Components use `MealPlannerRepository` asynchronously through `RepositoryProvider`. The default `LocalStorageMealPlannerRepository` validates stored data with Zod, backs up corrupt data, and resets to versioned deterministic seeds. `HttpMealPlannerRepository` maps the same interface to the contract in [`docs/backend-integration.md`](docs/backend-integration.md). Product rules are in [`docs/product-logic.md`](docs/product-logic.md).

Storage is read only after client mount, preventing server-render storage access and authentication flashes.

## Requirements and commands

Node.js 22.18.0 and npm 10.9.2 (pinned by `packageManager`).

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run e2e
npm run build
npm audit --omit=dev
```

Install Chromium once with `npx playwright install chromium` when needed.

## Demo accounts

All accounts use password `mealplanner-demo`:

- Owner: `owner@mealplanner.dev`
- Administrator: `admin@mealplanner.dev`
- Member: `member@mealplanner.dev`

Settings → Reset dummy data restores the deterministic dataset and clears the session.

## Data mode and backend connection

No variables are required; mock mode is the default. Public (never secret) settings:

```env
NEXT_PUBLIC_MEAL_PLANNER_DATA_MODE=mock
# or:
NEXT_PUBLIC_MEAL_PLANNER_DATA_MODE=http
NEXT_PUBLIC_MEAL_PLANNER_API_URL=https://api.example.com/api/v1
```

Implement the documented FastAPI/PostgreSQL contract outside this repository, configure the two HTTP values, and restart/rebuild the frontend. The HTTP adapter does not create endpoints and the backend remains responsible for auth, authorization, integrity, concurrency, and authoritative audit history.

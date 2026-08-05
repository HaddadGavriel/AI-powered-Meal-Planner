# Meal Planner

Meal Planner is a polished, frontend-only household meal-planning application built with Next.js App Router, React, TypeScript, Tailwind CSS, Zod, Vitest, React Testing Library, and Playwright.

## Scope and security

This version has **no backend, database, API routes, server actions, billing, real authentication, or AI features**. Authentication is simulated in the browser for development only and does not provide real security. All data is deterministic dummy data persisted in `localStorage` through `src/data/repository.ts`.

## Features

- Simulated sign in/out with protected pages and current-user display.
- Dashboard with current plan, today’s meals, upcoming recipes, ingredient and member counts.
- Household members, roles, pending invitations, role changes, resend/cancel invitations, and only-owner safeguards.
- Ingredient CRUD with search, category filter, archive/restore, and delete confirmation.
- Recipe CRUD with structured ingredient rows and ordered instruction steps.
- Weekly meal-plan CRUD with calendar view, status controls, meal add/move/remove interactions.
- Settings for profile, household details, appearance note, reset seed data, and logout.

## Prerequisites

- Node.js 22+
- npm 10+

## Install and run

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>.

## Demo credentials

- Email: `owner@mealplanner.dev`
- Password: `mealplanner-demo`

The login page displays these credentials.

## Mock persistence and reset

The mock repository writes app data to `localStorage` under deterministic keys. CRUD changes survive refreshes. Use **Settings → Development data → Reset seed data** to restore the original seed data and clear the simulated session.

## Scripts

```bash
npm run lint      # ESLint
npm test          # Vitest and React Testing Library
npm run e2e       # Playwright smoke test
npm run build     # Production build
npm run start     # Serve production build
```

If Playwright browsers are missing locally, run `npx playwright install chromium` first.

## Deployment to Vercel

Import the repository in Vercel and use the default Next.js settings:

- Install command: `npm ci`
- Build command: `npm run build`
- Output: Next.js default

No secrets are required for this frontend-only version. `.env.example` is included to document that state.

## Future backend contract

The expected FastAPI/PostgreSQL API contract is documented in [`docs/backend-integration.md`](docs/backend-integration.md). Connect the backend by replacing the mock repository implementation with an HTTP repository while keeping UI components unchanged.

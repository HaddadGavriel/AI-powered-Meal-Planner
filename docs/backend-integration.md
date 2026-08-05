# Backend Integration Contract

Meal Planner currently mocks every behavior in `src/data/repository.ts` with deterministic seed data and `localStorage`. Do **not** implement these endpoints in the frontend. A future FastAPI/PostgreSQL backend should provide the contract below.

## Shared conventions

- Base path: `/api/v1`.
- IDs: stable string IDs, preferably UUIDv7 in production; frontend treats them as opaque strings.
- Dates: calendar dates use `YYYY-MM-DD`; timestamps use UTC ISO 8601.
- Auth: `Authorization: Bearer <access_token>` for protected endpoints. Refresh token should be HTTP-only secure cookie or equivalent secure transport.
- Errors: `{ "error": { "code": "string", "message": "human readable", "details": [{ "field": "path", "message": "issue" }] } }`.
- Pagination: list endpoints accept `page`, `pageSize`, `search`, and domain filters where listed; return `{ "items": [], "page": 1, "pageSize": 25, "totalItems": 100, "totalPages": 4 }`.
- Concurrency: mutable resources should include `updatedAt`; clients may send `If-Match`/version later. Return `409 Conflict` when optimistic updates conflict.
- Validation errors: `422` with the shared error format. Auth errors: `401` missing/expired token, `403` insufficient role.

## Endpoint summary

| Method | Path | Purpose | Auth | Role |
| --- | --- | --- | --- | --- |
| POST | `/auth/login` | Exchange credentials for session | No | Public |
| POST | `/auth/logout` | Revoke session | Yes | Any |
| POST | `/auth/refresh` | Refresh access token | Refresh cookie | Any |
| GET | `/users/me` | Current user | Yes | Any |
| PATCH | `/users/me` | Update profile | Yes | Any |
| GET | `/household` | Household details | Yes | Member |
| PATCH | `/household` | Update household | Yes | Admin/Owner |
| GET | `/household/members` | List members | Yes | Member |
| PATCH | `/household/members/{memberId}` | Change role/status | Yes | Admin/Owner; only owner can manage owners |
| DELETE | `/household/members/{memberId}` | Remove member | Yes | Admin/Owner |
| GET | `/household/invitations` | List invitations | Yes | Admin/Owner |
| POST | `/household/invitations` | Create invitation | Yes | Admin/Owner |
| POST | `/household/invitations/{invitationId}/resend` | Resend invitation | Yes | Admin/Owner |
| DELETE | `/household/invitations/{invitationId}` | Cancel invitation | Yes | Admin/Owner |
| GET/POST | `/ingredients` | List/create ingredients | Yes | Member list, Admin create |
| GET/PATCH/DELETE | `/ingredients/{ingredientId}` | Read/update/delete ingredient | Yes | Member read, Admin mutate |
| GET/POST | `/recipes` | List/create recipes | Yes | Member list, Admin create |
| GET/PATCH/DELETE | `/recipes/{recipeId}` | Read/update/delete recipe | Yes | Member read, Admin mutate |
| GET/POST | `/meal-plans` | List/create weekly plans | Yes | Member list, Admin create |
| GET/PATCH/DELETE | `/meal-plans/{planId}` | Read/update/delete plan | Yes | Member read, Admin mutate |
| POST | `/meal-plans/{planId}/entries` | Add meal entry | Yes | Admin/Owner |
| PATCH/DELETE | `/meal-plans/{planId}/entries/{entryId}` | Update/delete meal entry | Yes | Admin/Owner |

## Request and response details

### Auth

`POST /auth/login` accepts `{ "email": "owner@mealplanner.dev", "password": "mealplanner-demo" }`. Success `200` returns `{ "accessToken": "jwt", "expiresAt": "2026-08-06T12:00:00Z", "user": { "id": "user-owner", "name": "Avery Stone", "email": "owner@mealplanner.dev", "role": "owner" } }`. Statuses: `200`, `401`, `422`, `429`.

`POST /auth/logout` returns `204`. Statuses: `204`, `401`.

`POST /auth/refresh` returns the same token envelope as login. Statuses: `200`, `401`.

### Current user and profile

`GET /users/me` returns the current user plus household role. `PATCH /users/me` accepts `{ "name": "Avery Stone", "email": "owner@mealplanner.dev" }` and returns the updated user. Statuses: `200`, `401`, `409`, `422`.

### Household, members, invitations

`GET /household` returns `{ "id", "name", "timezone", "defaultServings", "notes", "updatedAt" }`. `PATCH /household` accepts household fields and returns the updated household. Statuses: `200`, `401`, `403`, `409`, `422`.

`GET /household/members` paginates active and pending members; query: `page`, `pageSize`, `role`, `status`, `search`. `PATCH /household/members/{memberId}` accepts `{ "role": "administrator" }`. `DELETE /household/members/{memberId}` returns `204`. Backend must prevent removing or demoting the only owner and return `409` with code `ONLY_OWNER`.

`GET /household/invitations` paginates pending invitations. `POST /household/invitations` accepts `{ "email": "casey@example.com", "role": "member" }` and returns invitation details. Resend returns updated invitation; delete returns `204`.

### Ingredients

Ingredient body: `{ "name": "Onion", "category": "Produce", "defaultUnit": "pieces", "allergens": [], "notes": "optional", "status": "active" }`. List query: `page`, `pageSize`, `search`, `category`, `status`. Create returns `201`; get/update return full ingredient including `id`, `createdAt`, `updatedAt`; delete returns `204` or archive can be modeled as `PATCH { "status": "archived" }`. Statuses: `200`, `201`, `204`, `401`, `403`, `404`, `409`, `422`.

### Recipes

Recipe body includes structured ingredients: `{ "name": "Tomato Garlic Pasta", "description": "...", "prepTimeMinutes": 10, "cookTimeMinutes": 25, "servings": 4, "difficulty": "easy", "cuisine": "Italian", "mealTypes": ["dinner"], "tags": ["vegetarian"], "instructions": ["Boil pasta."], "ingredients": [{ "ingredientId": "ing-tomato", "quantity": 2, "unit": "cups", "preparationNote": "crushed" }], "imageUrl": null, "status": "active" }`. List query: `search`, `cuisine`, `mealType`, `tag`, `status`, pagination. Validate that every `ingredientId` exists or return `422`.

### Weekly meal plans and entries

Plan body: `{ "householdId": "hh-green-table", "name": "Week of Aug 3", "weekStartDate": "2026-08-03", "status": "draft", "notes": "optional", "entries": [] }`. List query: `weekStartDate`, `status`, pagination. Entry body: `{ "date": "2026-08-05", "mealType": "dinner", "recipeId": "rec-chicken-tacos", "servingCount": 4, "notes": "optional" }`. Validate that date belongs to the plan week unless backend intentionally supports overflow. Return `422` for invalid meal type, missing recipe, or non-positive servings.

## Repository mapping and mocked behaviors

- `login/logout/getSession/currentUser` map to auth and `/users/me`; currently simulated in localStorage.
- Household/member/invitation methods map to `/household/*`; current authorization is frontend-only.
- Ingredient/recipe/plan/meal methods map to their REST resources; current persistence is localStorage only.
- `reset()` has no production endpoint; it is development-only seed reset.

## Recommended backend connection order

1. Implement auth/session endpoints and replace simulated session storage.
2. Connect current user and household reads.
3. Connect ingredients, then recipes because recipes depend on ingredients.
4. Connect meal plans and entries.
5. Connect member/invitation administration and enforce roles server-side.
6. Add optimistic concurrency and pagination tuning.

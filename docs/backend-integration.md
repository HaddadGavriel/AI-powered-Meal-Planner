# Backend integration contract

The frontend implements no API routes or server actions. `HttpMealPlannerRepository` connects to the future FastAPI service when `NEXT_PUBLIC_MEAL_PLANNER_DATA_MODE=http`; `NEXT_PUBLIC_MEAL_PLANNER_API_URL` defaults to `/api/v1`. This document is normative and matches `src/data/repository.ts`.

## Authentication lifecycle

The backend issues a short-lived bearer access token and a longer-lived, rotated refresh credential in a `Secure`, `HttpOnly`, `SameSite` cookie. The frontend holds the access token **in memory only** and sends `credentials: include` so the browser can send the refresh cookie. It never stores either token in localStorage.

1. `POST /auth/login` is public. Body: `{"email":"owner@example.com","password":"secret"}`.
2. Success `200` returns an auth envelope: `{"accessToken":"opaque-or-jwt","expiresAt":"2030-01-01T12:15:00.000Z","user":<Member>}` and sets/rotates the refresh cookie.
3. On startup, `POST /auth/refresh` is attempted before any protected `/bootstrap` request. It has no body, is public with respect to bearer auth, uses the refresh cookie, and returns the same auth envelope.
4. Protected requests contain `Authorization: Bearer <accessToken>`.
5. A protected `401` triggers one refresh and one retry. A failed refresh clears in-memory auth and requires sign-in.
6. `POST /auth/logout` is protected, returns `204`, revokes the refresh credential, and expires its cookie.

Statuses: login `200/401/422/429`; refresh `200/401/429`; logout `204/401`. Public invitation inspection and acceptance never trigger refresh or `/bootstrap`.

## Shared wire rules

- Base path: `/api/v1` unless configured otherwise.
- IDs are opaque nonempty strings. Dates are `YYYY-MM-DD`; timestamps are UTC ISO 8601.
- JSON requests use `Content-Type: application/json`. Every successful JSON response is runtime-validated by Zod. Schema mismatches become client error `INVALID_RESPONSE`.
- `204` responses contain no body. The adapter accepts `204` only for methods documented as returning `void`; a `204` where an object is required is invalid.
- PATCH bodies include only changed mutable fields. Server-owned IDs and timestamps are ignored/rejected.
- All protected resources are household-scoped. Frontend role controls are UX only; the backend authenticates and authorizes every request.
- Mutable resources should return `ETag` or a version alongside `updatedAt`. A later client may send `If-Match`; stale writes return `409 CONFLICT` and never overwrite silently.

## Errors

Every non-success response uses:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be saved.",
    "details": [{ "field": "items.0.quantity", "message": "Must be greater than zero." }]
  }
}
```

The adapter preserves `code`, `message`, field details, and HTTP status. Use `400` malformed JSON, `401` missing/expired auth, `403` forbidden role/household, `404` unknown record, `409` duplicate/reference/only-owner/concurrency conflict, `410` expired/revoked/used invitation, `422` validation, and `429` rate limiting.

## Schemas

All response objects contain exactly the fields below (additional forward-compatible fields may be accepted only after schemas are updated).

- **Member**: `{id,name,email,avatarInitials,role:"owner"|"administrator"|"member",status:"active"|"inactive",joinedAt}`.
- **Session** is client-derived from an auth envelope: `{userId,expiresAt}`.
- **Household**: `{id,name,timezone,defaultServings,notes?,updatedAt}`.
- **InvitationSummary**: `{id,householdId,email,proposedRole:"administrator"|"member",invitedBy,createdAt,expiresAt,status:"pending"|"accepted"|"expired"|"revoked",acceptedAt?}`. It deliberately contains no token or acceptance URL.
- **InvitationAcceptanceLink**: `{acceptanceUrl}`. This privileged response is returned only to administrators/owners and must not be embedded in bootstrap or list responses.
- **DietaryProfile**: `{id,memberId,dietaryPatterns:string[],allergens:string[],excludedIngredients:string[],preferences,updatedAt}`.
- **Ingredient**: `{id,name,category,defaultUnit,allergens:string[],notes?,status:"active"|"archived",createdAt,updatedAt}`.
- **RecipeIngredient**: `{ingredientId,quantity,unit,preparationNote?}` where quantity is positive.
- **Recipe**: `{id,name,description,prepTimeMinutes,cookTimeMinutes,servings,difficulty,cuisine,mealTypes,tags,status,imageUrl?,ingredients,instructions,createdAt,updatedAt}`.
- **MealEntry**: `{id,date,mealType,recipeId,servingCount,notes?}`.
- **WeeklyMealPlan**: `{id,householdId,name,weekStartDate,status,notes?,entries,createdAt,updatedAt}`.
- **ShoppingListItem**: `{id,ingredientId?,name,category,quantity,unit,checked,source:"generated"|"manual"}`.
- **ShoppingList**: `{id,householdId,planId,name,items,createdAt,updatedAt}`.
- **AuditEvent**: `{id,actorId?,action,entityType,entityId,timestamp,summary}`.
- **AppData/bootstrap**: `{version:2,household,members,invitations,dietaryProfiles,ingredients,recipes,plans,shoppingLists,auditEvents}`.

## Pagination

Collection endpoints accept `page` (default `1`), `pageSize` (default `25`, maximum `100`), `search`, `sort`, and filters listed below. They return:

```json
{ "items": [], "page": 1, "pageSize": 25, "totalItems": 0, "totalPages": 0 }
```

The current adapter uses the aggregate `/bootstrap` for its UI collections. Paginated endpoints remain required for incremental backend adoption and direct detail screens. `/bootstrap` returns the Stage 0 household dataset using token-free `InvitationSummary` records. It must never include invitation tokens or acceptance URLs. Ordinary members may receive summaries for shared status context, but the frontend hides invitation management; a backend may additionally return an empty invitation-summary array for members.

## Exact repository mapping

### Bootstrap and current user

- `GET /bootstrap` → `200 AppData`; protected, any active member.
- `GET /users/me` → `200 Member`; protected, any member.
- `PATCH /users/me`, body `{"name":"Avery Stone","email":"avery@example.com"}` → `200 Member`; protected self. Errors `401/409/422`. When email changes, the backend must atomically update the login identifier and profile email, rejecting collisions with members or live pending invitations; credentials must never enter bootstrap data.

### Household, dietary profiles, and members

- `PATCH /household`, partial body containing `name`, `timezone`, `defaultServings`, and/or `notes` → `200 Household`; administrator/owner.
- `PUT /household/members/{memberId}/dietary-profile`, body `{dietaryPatterns,allergens,excludedIngredients,preferences}` → `200 DietaryProfile`; self, or elevated policy explicitly implemented by backend.
- `PATCH /household/members/{memberId}`, body `{"role":"administrator"}` → `200 Member`; administrator for non-owners, owner for owners/owner promotion.
- `DELETE /household/members/{memberId}` → `204`; same role rules. `409 ONLY_OWNER` prevents removing the final owner.
- `GET /household/members?page=1&pageSize=25&role=member&status=active&search=...` → paginated Members.

### Invitations

- `POST /household/invitations`, body `{"email":"new@example.com","proposedRole":"member"}` → `201 InvitationSummary`; administrator/owner. `409 DUPLICATE` for an active member or pending invitation.
- `POST /household/invitations/{id}/resend` → `200 InvitationSummary`; rotates the server-held token and extends expiry; administrator/owner.
- `DELETE /household/invitations/{id}` → `204`; transitions pending to revoked; administrator/owner.
- `POST /household/invitations/{id}/acceptance-link` → `200 {"acceptanceUrl":"https://app.example/invite/opaque-token"}`; administrator/owner only. This is the sole authenticated operation that reveals an acceptance capability.
- `GET /invitations/{token}` → `200 InvitationSummary`; public, rate-limited. Return `200` with accepted/revoked/expired status so the UI can explain it; `404` only for unknown token.
- `POST /invitations/{token}/accept`, body `{"name":"New Person","password":"at-least-8-characters"}` → `200` auth envelope and sets the secure HTTP-only refresh cookie. It creates the user and membership, consumes the token, establishes the session, and permits later email/password sign-in. Public and rate-limited. Errors `404` invalid token, `409 DUPLICATE`, `410 INVITATION_UNAVAILABLE` for expired/revoked/accepted, and `422` for name/password validation.
- `GET /household/invitations?page=1&pageSize=25&status=pending&search=...` → paginated InvitationSummary records; administrator/owner.

### Ingredients

- `POST /ingredients`, body omits `id/createdAt/updatedAt` → `201 Ingredient`.
- `PATCH /ingredients/{id}`, partial mutable body → `200 Ingredient`.
- `DELETE /ingredients/{id}` → `204`; `409 REFERENCED` if any recipe uses it.
- `GET /ingredients?page=1&pageSize=25&search=...&category=Produce&status=active` → paginated Ingredients.
  Reads allow members; mutations require administrator/owner. Names are unique case-insensitively per household.

### Recipes

- `POST /recipes`, complete mutable Recipe body without server fields → `201 Recipe`.
- `PATCH /recipes/{id}`, partial mutable body → `200 Recipe`.
- `DELETE /recipes/{id}` → `204`; `409 REFERENCED` if a plan entry uses it.
- `GET /recipes?page=1&pageSize=25&search=...&cuisine=Italian&mealType=dinner&tag=quick&status=active` → paginated Recipes.
  Every ingredient ID must exist; at least one positive row and instruction are required. Reads allow members; mutations require administrator/owner.

### Weekly plans and meal entries

- `POST /meal-plans`, body without server fields → `201 WeeklyMealPlan`.
- `PATCH /meal-plans/{id}`, partial body → `200 WeeklyMealPlan`. Reject a changed week start with `409 ENTRY_OUTSIDE_WEEK` if existing entries fall outside the resulting seven-day interval.
- `DELETE /meal-plans/{id}` → `204`; transactionally deletes its derived shopping list.
- `POST /meal-plans/{id}/entries`, body without entry ID → `200 WeeklyMealPlan`.
- `PATCH /meal-plans/{id}/entries/{entryId}`, body with entry ID accepted but path authoritative → `200 WeeklyMealPlan`.
- `DELETE /meal-plans/{id}/entries/{entryId}` → `200 WeeklyMealPlan` (the adapter expects the resulting plan, not `204`).
- `GET /meal-plans?page=1&pageSize=25&weekStartDate=...&status=active` → paginated plans.
  Reads allow members; all mutations require administrator/owner. Entry dates must be in-week and recipes must exist.

### Shopping lists

- `POST /meal-plans/{planId}/shopping-list` → `200 ShoppingList`; generate or regenerate.
- `PATCH /shopping-lists/{id}`, body is a partial ShoppingList (currently item replacement) → `200 ShoppingList`.
- `DELETE /shopping-lists/{id}/checked` → `200 ShoppingList` after removal.
- `GET /shopping-lists?page=1&pageSize=25&planId=...` → paginated ShoppingLists.
  Reads allow members; mutations require administrator/owner. All quantities are positive and units nonempty. Generation scales by `entry.servingCount / recipe.servings`, combines only ingredient plus normalized unit, performs no conversion, preserves manual items, and preserves safely matched generated checked state.

### Audit reads

- `GET /audit-events?page=1&pageSize=25&actorId=...&action=...&entityType=...&from=...&to=...` → paginated AuditEvents; protected household member.
- There are no frontend audit-write endpoints. Backend mutations append authoritative events transactionally.

## Referential integrity and transactional behavior

The backend verifies all household, member, ingredient, recipe, plan, and shopping-list relationships on every write. Invitation `invitedBy` is a historical user identifier and may refer to a member who is no longer in the active-members collection; it must not be reassigned or used to prevent member removal. Failed validation must not partially mutate any record. Archiving preserves references; hard deletion is allowed only when the rules above permit it. Invitation acceptance, plan deletion, shopping regeneration, role changes, and audit append should be single transactions.

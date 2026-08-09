# Backend integration contract

The frontend defaults to validated localStorage and implements no server endpoint. A future FastAPI/PostgreSQL service is selected with `NEXT_PUBLIC_MEAL_PLANNER_DATA_MODE=http` and `NEXT_PUBLIC_MEAL_PLANNER_API_URL`. Types correspond to the Zod schemas in `src/lib/schemas.ts`.

## Conventions, auth, pagination, and errors
Base path is `/api/v1`; opaque IDs are strings, calendar dates `YYYY-MM-DD`, timestamps UTC ISO 8601. Protected requests use bearer authentication (refresh credentials in secure HTTP-only cookies). The backend reauthorizes every request; frontend role checks are UX only.

List requests accept `page` (default 1), `pageSize` (default 25, maximum 100), `search`, `sort`, and stated filters. Responses are `{items,page,pageSize,totalItems,totalPages}`. Mutations return the full schema unless `204` is stated. Resources expose `updatedAt` and preferably a version/ETag; clients send `If-Match`, stale writes return `409 CONFLICT` and never silently overwrite.

Errors are `{error:{code,message,details:[{field,message}]}}`. Use `400` malformed request, `401` absent/expired auth, `403` role/household denial, `404`, `409` duplicate/reference/only-owner/concurrency conflicts, `410` expired/revoked/used invitations, `422` field validation, and `429`. Delete is `204`; archive/restore is a PATCH status change. Transactionally reject dangling references.

## Schemas
- `User`: `{id,name,email,avatarInitials}`; `Member` adds `{role: owner|administrator|member,status: active|inactive,joinedAt}`.
- `Session`: `{userId,expiresAt}` (login additionally returns access token in production).
- `Household`: `{id,name,timezone,defaultServings,notes?,updatedAt}`.
- `Invitation`: `{id,householdId,email,proposedRole: administrator|member,invitedBy,createdAt,expiresAt,status: pending|accepted|expired|revoked,token,acceptedAt?}`. Production may return the token only on safe inspection/delivery channels.
- `DietaryProfile`: `{id,memberId,dietaryPatterns[],allergens[],excludedIngredients[],preferences,updatedAt}`.
- `Ingredient`: `{id,name,category,defaultUnit,allergens[],notes?,status,createdAt,updatedAt}`.
- `RecipeIngredient`: `{ingredientId,quantity>0,unit,preparationNote?}`; `Recipe`: `{id,name,description,prepTimeMinutes,cookTimeMinutes,servings,difficulty,cuisine,mealTypes[],tags[],status,imageUrl?,ingredients[],instructions[],createdAt,updatedAt}`.
- `MealEntry`: `{id,date,mealType,recipeId,servingCount>0,notes?}`; `WeeklyMealPlan`: `{id,householdId,name,weekStartDate,status,notes?,entries[],createdAt,updatedAt}`.
- `ShoppingListItem`: `{id,ingredientId?,name,category,quantity>0,unit,checked,source: generated|manual}`; `ShoppingList`: `{id,householdId,planId,name,items[],createdAt,updatedAt}`.
- `AuditEvent`: `{id,actorId?,action,entityType,entityId,timestamp,summary}`.

Create/PATCH bodies omit server IDs/timestamps; PATCH fields are optional. All response bodies validate against these shapes.

## Operations and requirements
| Method and path | Purpose | Required role |
|---|---|---|
| `POST /auth/login`, `/auth/logout`, `/auth/refresh`; `GET /auth/session` | session lifecycle | public / any |
| `GET/PATCH /users/me` | read/update name and email | any |
| `GET/PATCH /household` | read/update household | any / admin |
| `GET /household/members`; `PATCH/DELETE /household/members/{id}` | list/change role/remove | any / admin; owner changes owner |
| `GET/PUT /household/members/{id}/dietary-profile` | read/update dietary profile | any; self or admin policy |
| `GET/POST /household/invitations` | paginate/create pending offers | admin |
| `POST /household/invitations/{id}/resend`; `DELETE .../{id}` | rotate token / revoke | admin |
| `GET /invitations/{token}`; `POST /invitations/{token}/accept` | public inspection/consume with `{name}` | public, rate-limited |
| `GET/POST /ingredients`; `GET/PATCH/DELETE /ingredients/{id}` | CRUD, filters `category,status` | read any; mutate admin |
| `GET/POST /recipes`; `GET/PATCH/DELETE /recipes/{id}` | CRUD, filters `cuisine,mealType,tag,status` | read any; mutate admin |
| `GET/POST /meal-plans`; `GET/PATCH/DELETE /meal-plans/{id}` | plan CRUD, filters `weekStartDate,status` | read any; mutate admin |
| `POST /meal-plans/{id}/entries`; `PATCH/DELETE .../entries/{entryId}` | entry add/edit/move/remove | admin |
| `GET /shopping-lists`; `GET/PATCH /shopping-lists/{id}` | list read and item replacement/edit | read any; mutate admin |
| `POST /meal-plans/{id}/shopping-list` | generate/regenerate transactionally | admin |
| `DELETE /shopping-lists/{id}/checked` | clear checked lines | admin |
| `GET /audit-events` | read; filters `actorId,action,entityType,from,to` | member (household-scoped) |
| `GET /bootstrap` | optional aggregate initial payload matching `AppData` | any |

Ingredient names and member/invitation emails are household-unique case-insensitively. Reject deleting referenced ingredients/recipes with `409 REFERENCED`; reject removing/demoting the only owner with `409 ONLY_OWNER`. Validate recipe references and nonempty rows/steps, entry recipes and seven-day date bounds. Plan deletion transactionally removes its derived shopping list or returns a documented conflict. Shopping generation and regeneration must implement the exact scaling, normalized-unit aggregation, no-conversion, manual preservation, and safe checked-state matching rules in `product-logic.md`.

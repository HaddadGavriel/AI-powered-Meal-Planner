# Reserved capstone work

The supporting backend intentionally does **not** contain implementations for the core learning work.

1. **Ingredients:** add the ingredient model and migration, household-scoped repository/service, list,
   create, patch and delete routes, case-insensitive household uniqueness, archive behavior, and
   referenced-deletion protection.
2. **Recipes:** next add recipe and recipe-ingredient models/migrations, validation of existing
   household ingredients, positive rows and ordered instructions, list/create/patch/delete routes,
   and recipe referenced-deletion protection.
3. **Weekly plans:** add plan and meal-entry models/migrations and endpoints, seven-day date checks,
   recipe references, status rules, and transactional plan deletion.
4. **Shopping lists:** finally add list/item models/migrations and endpoints, serving scaling,
   aggregation only by ingredient plus normalized unit (without conversion), regeneration, manual
   item and safely matched checked-state preservation, and clear-checked behavior.

Each model belongs in `app/models.py` (or a clearly named core model module once it becomes large),
and every database change belongs in a new Alembic revision. Create focused router modules such as
`app/routers/ingredients.py`, `recipes.py`, `meal_plans.py`, and `shopping_lists.py`, then register
them through the existing API router in `app/api.py`. Keep substantial business logic out of routers.
Reuse the existing authentication, authorization, `ApiError`, pagination, and audit helpers. Connect
each completed resource to bootstrap only after its persistence and tests exist. Follow the exact
routes and business rules in `docs/backend-integration.md` and `docs/product-logic.md`.

Also reserved: all AI, embeddings, RAG, MCP, LangChain/LangGraph/agents, nutrition calculations,
billing, and medical-safety claims. This file intentionally provides connection points and ordering,
not implementation code.

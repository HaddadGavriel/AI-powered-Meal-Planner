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
each schema change in a new Alembic revision, and each household-scoped route/service beside the
supporting flow in `app/api.py`. Reuse `current_membership`, `elevated`, `ApiError`, pagination, and
`audit`. Replace the four empty arrays in `bootstrap` with a small core-data provider only after the
corresponding persistence exists. Follow the exact routes and business rules in
`docs/backend-integration.md` and `docs/product-logic.md`.

Also reserved: all AI, embeddings, RAG, MCP, LangChain/LangGraph/agents, nutrition calculations,
billing, and medical-safety claims. This file intentionally provides connection points and ordering,
not implementation code.

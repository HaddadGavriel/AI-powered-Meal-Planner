# Product logic for backend implementers

## Purpose and non-goals
Meal Planner coordinates a household's dietary information, reusable ingredients and recipes, weekly meals, and groceries. The current browser demo proves UX and deterministic rules only. It is not real authentication, email, medical advice, AI, billing, a database, or a backend.

## Actors and trust boundary
A **member** reads shared content and edits only their own dietary profile. An **administrator** also manages normal content, non-owner membership, invitations, plans, and lists. An **owner** additionally manages owner-level roles and household continuity. There must always be at least one owner. UI checks merely hide or disable controls: the backend must authenticate and reauthorize every request and enforce household isolation.

## User and household flows
A new user receives one pending offer for one household, previews/opens its token, supplies a name, and accepts. Acceptance consumes the token, creates an active member and empty dietary profile, then permits sign-in. A returning user signs in, restores their household context, reviews the dashboard, and works within their role. A household is created with an owner, edited by admins/owners, and should only be deleted through a future explicit ownership/data-retention process.

An invitation contains email, proposed non-owner role, inviter, creation/expiry times, status, and a single-use token. Duplicate active members or pending invitations are rejected. Resend rotates the token and extends expiry; revoke invalidates it. Inspection exposes pending, expired, revoked, accepted/already-used states. No email is sent by this frontend.

## Dietary information and safety
Each member owns one dietary profile: patterns, allergens, excluded/disliked ingredients, free text, and update time. Administrators may support management, but members edit only their own. Data is user-supplied and informational. Ingredient metadata can produce obvious deterministic conflict warnings, but absence of a match must never be represented as medically safe; the backend must preserve this language and data provenance.

## Ingredients, recipes, and integrity
Ingredients are reusable records with category, unit, allergen metadata, notes, and active/archive state. Names are household-unique case-insensitively. Recipes contain structured positive-quantity ingredient references and ordered, nonempty instructions plus descriptive metadata. Every reference must exist. Referenced ingredients and recipes cannot be hard-deleted; archive them or first remove every reference. Archive hides normal selection but preserves history; delete permanently removes an unreferenced record.

## Weekly plans
A weekly plan has a name, seven-day start, status, notes, and entries. Entries select an in-week date, meal type, existing recipe, positive servings, and notes. They can be added, edited/moved with an accessible form, or removed. Plans can be draft, active, completed, or archived. Plan deletion also removes its derived shopping list after explicit confirmation in a production UX.

## Shopping lists
Generation scales each recipe row by `entry.servingCount / recipe.servings`. It aggregates only identical ingredient IDs with normalized (trimmed, case-insensitive) units; it never converts units. Incompatible units remain separate. Output sorts by category and name. Regeneration preserves manual lines and carries checked state only when an old generated line safely matches ingredient plus normalized unit. Users can add manual lines, edit quantity/unit, check, remove, clear checked, and regenerate.

## Audit events
Important sign-in, profile, household, invitation, member, ingredient, recipe, plan, meal, and shopping actions append actor, action, entity type/ID, timestamp, and human summary. Browser history is demonstrative and mutable by browser tools; backend events must be append-only, paginated, household-scoped, and authoritative.

## Dummy data, reset, and provisional behavior
Versioned seed data supplies three roles and coherent relationships. Valid changes persist across refreshes. Invalid/corrupt storage is backed up under a timestamped key then reset; Settings reset restores seeds and signs out. Local tokens, sessions, audit timestamps, role checks, pagination-free bootstrap loading, conflict detection, and destructive confirmations are provisional until the backend provides secure equivalents, concurrency, delivery, retention, and transactional integrity.

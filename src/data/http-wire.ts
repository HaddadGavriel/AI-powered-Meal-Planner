import { z } from 'zod';
import {
  appDataSchema,
  auditEventSchema,
  dietaryProfileSchema,
  householdSchema,
  ingredientSchema,
  invitationAcceptanceLinkSchema,
  invitationSchema,
  memberSchema,
  recipeSchema,
  shoppingListSchema,
  weeklyMealPlanSchema,
} from '@/lib/schemas';

const id = z.string().min(1);
const timestamp = z.string().datetime();

const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const camel = (key: string) =>
  key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

function mapKeys(value: unknown, keyMapper: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, keyMapper));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [keyMapper(key), mapKeys(item, keyMapper)]),
    );
  return value;
}

export const toWireRequest = (value: unknown): unknown => mapKeys(value, snake);
export const fromWire = (value: unknown): unknown => mapKeys(value, camel);

export const memberHttpSchema = z
  .object({
    id,
    name: z.string().min(2),
    email: z.string().email(),
    avatar_initials: z.string().min(1).max(4),
    role: z.enum(['owner', 'administrator', 'member']),
    status: z.enum(['active', 'inactive']),
    joined_at: timestamp,
  })
  .transform(fromWire)
  .pipe(memberSchema);

export const householdHttpSchema = z
  .object({
    id,
    name: z.string().min(2),
    timezone: z.string().min(1),
    default_servings: z.number().int().positive(),
    notes: z.string().nullable().optional(),
    updated_at: timestamp,
  })
  .transform(fromWire)
  .pipe(householdSchema);

export const dietaryProfileHttpSchema = z
  .object({
    id,
    membership_id: id,
    dietary_patterns: z.array(z.string()),
    allergens: z.array(z.string()),
    excluded_ingredients: z.array(z.string()),
    preferences: z.string(),
    updated_at: timestamp,
  })
  .transform((profile) => ({
    id: profile.id,
    memberId: profile.membership_id,
    dietaryPatterns: profile.dietary_patterns,
    allergens: profile.allergens,
    excludedIngredients: profile.excluded_ingredients,
    preferences: profile.preferences,
    updatedAt: profile.updated_at,
  }))
  .pipe(dietaryProfileSchema);

export const invitationHttpSchema = z
  .object({
    id,
    household_id: id,
    email: z.string().email(),
    proposed_role: z.enum(['administrator', 'member']),
    invited_by: id,
    created_at: timestamp,
    expires_at: timestamp,
    status: z.enum(['pending', 'accepted', 'expired', 'revoked']),
    accepted_at: timestamp.nullable().optional(),
  })
  .transform(fromWire)
  .pipe(invitationSchema);

export const acceptanceLinkHttpSchema = z
  .object({ acceptance_url: z.string().min(1) })
  .transform(fromWire)
  .pipe(invitationAcceptanceLinkSchema);

const auditEventHttpSchema = z
  .object({
    id,
    actor_id: id.nullable().optional(),
    action: z.string().min(1),
    entity_type: z.string().min(1),
    entity_id: id,
    timestamp,
    summary: z.string().min(1),
  })
  .transform(fromWire)
  .pipe(auditEventSchema);

// Reserved backend domains have no settled wire shape yet. These pipelines only
// establish the casing boundary; the existing frontend schemas remain authoritative.
export const ingredientHttpSchema = z.unknown().transform(fromWire).pipe(ingredientSchema);
export const recipeHttpSchema = z.unknown().transform(fromWire).pipe(recipeSchema);
export const weeklyMealPlanHttpSchema = z.unknown().transform(fromWire).pipe(weeklyMealPlanSchema);
export const shoppingListHttpSchema = z.unknown().transform(fromWire).pipe(shoppingListSchema);

export const authEnvelopeHttpSchema = z
  .object({
    access_token: z.string().min(1),
    expires_at: timestamp,
    user: memberHttpSchema,
  })
  .transform((envelope) => ({
    accessToken: envelope.access_token,
    expiresAt: envelope.expires_at,
    user: envelope.user,
  }));

export const bootstrapHttpSchema = z
  .object({
    version: z.literal(2),
    household: householdHttpSchema,
    members: z.array(memberHttpSchema),
    invitations: z.array(invitationHttpSchema),
    dietary_profiles: z.array(dietaryProfileHttpSchema),
    ingredients: z.array(ingredientHttpSchema),
    recipes: z.array(recipeHttpSchema),
    plans: z.array(weeklyMealPlanHttpSchema),
    shopping_lists: z.array(shoppingListHttpSchema),
    audit_events: z.array(auditEventHttpSchema),
  })
  .transform((data) => ({
    version: data.version,
    household: data.household,
    members: data.members,
    invitations: data.invitations,
    dietaryProfiles: data.dietary_profiles,
    ingredients: data.ingredients,
    recipes: data.recipes,
    plans: data.plans,
    shoppingLists: data.shopping_lists,
    auditEvents: data.audit_events,
  }))
  .pipe(appDataSchema);

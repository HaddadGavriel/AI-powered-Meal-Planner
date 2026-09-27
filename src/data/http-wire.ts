import { z } from 'zod';
import {
  appDataSchema,
  dietaryProfileSchema,
  householdSchema,
  invitationAcceptanceLinkSchema,
  invitationSchema,
  memberSchema,
} from '@/lib/schemas';

const id = z.string().min(1);
const timestamp = z.string().datetime();
const memberWireSchema = z.object({
  id,
  name: z.string().min(2),
  email: z.string().email(),
  avatar_initials: z.string().min(1).max(4),
  role: z.enum(['owner', 'administrator', 'member']),
  status: z.enum(['active', 'inactive']),
  joined_at: timestamp,
});
const householdWireSchema = z.object({
  id,
  name: z.string().min(2),
  timezone: z.string().min(1),
  default_servings: z.number().int().positive(),
  notes: z.string().nullable().optional(),
  updated_at: timestamp,
});
const dietaryProfileWireSchema = z.object({
  id,
  membership_id: id,
  dietary_patterns: z.array(z.string()),
  allergens: z.array(z.string()),
  excluded_ingredients: z.array(z.string()),
  preferences: z.string(),
  updated_at: timestamp,
});
const invitationWireSchema = z.object({
  id,
  household_id: id,
  email: z.string().email(),
  proposed_role: z.enum(['administrator', 'member']),
  invited_by: id,
  created_at: timestamp,
  expires_at: timestamp,
  status: z.enum(['pending', 'accepted', 'expired', 'revoked']),
  accepted_at: timestamp.nullable().optional(),
});
const auditEventWireSchema = z.object({
  id,
  actor_id: id.nullable().optional(),
  action: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: id,
  timestamp,
  summary: z.string().min(1),
});

export const authEnvelopeWireSchema = z.object({
  access_token: z.string().min(1),
  expires_at: timestamp,
  user: memberWireSchema,
});
export const acceptanceLinkWireSchema = z.object({ acceptance_url: z.string().min(1) });
export const bootstrapWireSchema = z.object({
  version: z.literal(2),
  household: householdWireSchema,
  members: z.array(memberWireSchema),
  invitations: z.array(invitationWireSchema),
  dietary_profiles: z.array(dietaryProfileWireSchema),
  ingredients: z.array(z.unknown()),
  recipes: z.array(z.unknown()),
  plans: z.array(z.unknown()),
  shopping_lists: z.array(z.unknown()),
  audit_events: z.array(auditEventWireSchema),
});

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

export const memberFromWire = (value: unknown) =>
  memberSchema.parse(fromWire(memberWireSchema.parse(value)));
export const householdFromWire = (value: unknown) =>
  householdSchema.parse(fromWire(householdWireSchema.parse(value)));
export const dietaryProfileFromWire = (value: unknown) => {
  const parsed = dietaryProfileWireSchema.parse(value);
  return dietaryProfileSchema.parse({
    id: parsed.id,
    memberId: parsed.membership_id,
    dietaryPatterns: parsed.dietary_patterns,
    allergens: parsed.allergens,
    excludedIngredients: parsed.excluded_ingredients,
    preferences: parsed.preferences,
    updatedAt: parsed.updated_at,
  });
};
export const invitationFromWire = (value: unknown) =>
  invitationSchema.parse(fromWire(invitationWireSchema.parse(value)));
export const acceptanceLinkFromWire = (value: unknown) =>
  invitationAcceptanceLinkSchema.parse(fromWire(acceptanceLinkWireSchema.parse(value)));
export const bootstrapFromWire = (value: unknown) => {
  const parsed = bootstrapWireSchema.parse(value);
  return appDataSchema.parse({
    version: parsed.version,
    household: householdFromWire(parsed.household),
    members: parsed.members.map(memberFromWire),
    invitations: parsed.invitations.map(invitationFromWire),
    dietaryProfiles: parsed.dietary_profiles.map(dietaryProfileFromWire),
    // These domains are reserved backend work. Preserve their existing frontend
    // validation while translating casing, without inventing a backend contract.
    ingredients: fromWire(parsed.ingredients),
    recipes: fromWire(parsed.recipes),
    plans: fromWire(parsed.plans),
    shoppingLists: fromWire(parsed.shopping_lists),
    auditEvents: fromWire(parsed.audit_events),
  });
};
export const authEnvelopeFromWire = (value: unknown) => {
  const parsed = authEnvelopeWireSchema.parse(value);
  return {
    accessToken: parsed.access_token,
    expiresAt: parsed.expires_at,
    user: memberFromWire(parsed.user),
  };
};

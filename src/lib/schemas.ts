import { z } from 'zod';
import { isValidTimeZone } from './calendar';
const id = z.string().min(1);
const timestamp = z.string().datetime();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const roleSchema = z.enum(['owner', 'administrator', 'member']);
export const statusSchema = z.enum(['active', 'archived']);
export const mealTypeSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export const userSchema = z.object({
  id,
  name: z.string().trim().min(2),
  email: z.string().email(),
  avatarInitials: z.string().min(1).max(4),
});
export const sessionSchema = z.object({ userId: id, expiresAt: timestamp });
export const householdSchema = z.object({
  id,
  name: z.string().min(2),
  timezone: z.string().min(1).refine(isValidTimeZone, 'Use a valid IANA timezone'),
  defaultServings: z.number().int().positive(),
  notes: z.string().optional(),
  updatedAt: timestamp,
});
export const memberSchema = userSchema.extend({
  role: roleSchema,
  status: z.enum(['active', 'inactive']),
  joinedAt: timestamp,
});
export const invitationSummarySchema = z.object({
  id,
  householdId: id,
  email: z.string().email(),
  proposedRole: z.enum(['administrator', 'member']),
  invitedBy: id,
  createdAt: timestamp,
  expiresAt: timestamp,
  status: z.enum(['pending', 'accepted', 'expired', 'revoked']),
  acceptedAt: timestamp.optional(),
});
export const invitationSchema = invitationSummarySchema;
export const invitationAcceptanceLinkSchema = z.object({ acceptanceUrl: z.string().min(1) });
export const dietaryProfileSchema = z.object({
  id,
  memberId: id,
  dietaryPatterns: z.array(z.string()),
  allergens: z.array(z.string()),
  excludedIngredients: z.array(z.string()),
  preferences: z.string(),
  updatedAt: timestamp,
});
export const ingredientSchema = z.object({
  id,
  name: z.string().trim().min(2),
  category: z.enum([
    'Produce',
    'Meat and poultry',
    'Seafood',
    'Dairy',
    'Grains',
    'Legumes',
    'Spices',
    'Condiments',
    'Baking',
    'Other',
  ]),
  defaultUnit: z.string().trim().min(1),
  allergens: z.array(z.string()),
  notes: z.string().optional(),
  status: statusSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const recipeIngredientSchema = z.object({
  ingredientId: id,
  quantity: z.number().positive(),
  unit: z.string().trim().min(1),
  preparationNote: z.string().optional(),
});
export const recipeSchema = z.object({
  id,
  name: z.string().trim().min(3),
  description: z.string().trim().min(3),
  prepTimeMinutes: z.number().int().nonnegative(),
  cookTimeMinutes: z.number().int().nonnegative(),
  servings: z.number().int().positive(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  cuisine: z.string().min(2),
  mealTypes: z.array(mealTypeSchema).min(1),
  tags: z.array(z.string()),
  status: statusSchema,
  imageUrl: z.string().url().or(z.literal('')).optional(),
  ingredients: z.array(recipeIngredientSchema).min(1),
  instructions: z.array(z.string().trim().min(2)).min(1),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const mealEntrySchema = z.object({
  id,
  date: dateSchema,
  mealType: mealTypeSchema,
  recipeId: id,
  servingCount: z.number().positive(),
  notes: z.string().optional(),
});
export const weeklyMealPlanSchema = z.object({
  id,
  householdId: id,
  name: z.string().min(2),
  weekStartDate: dateSchema,
  status: z.enum(['draft', 'active', 'completed', 'archived']),
  notes: z.string().optional(),
  entries: z.array(mealEntrySchema),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const shoppingListItemSchema = z.object({
  id,
  ingredientId: id.optional(),
  name: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
  checked: z.boolean(),
  source: z.enum(['generated', 'manual']),
});
export const shoppingListSchema = z.object({
  id,
  householdId: id,
  planId: id,
  name: z.string().min(2),
  items: z.array(shoppingListItemSchema),
  createdAt: timestamp,
  updatedAt: timestamp,
});
export const auditEventSchema = z.object({
  id,
  actorId: id.optional(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: id,
  timestamp,
  summary: z.string().min(1),
});
export const appDataSchema = z.object({
  version: z.literal(2),
  household: householdSchema,
  members: z.array(memberSchema),
  invitations: z.array(invitationSummarySchema),
  dietaryProfiles: z.array(dietaryProfileSchema),
  ingredients: z.array(ingredientSchema),
  recipes: z.array(recipeSchema),
  plans: z.array(weeklyMealPlanSchema),
  shoppingLists: z.array(shoppingListSchema),
  auditEvents: z.array(auditEventSchema),
});
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

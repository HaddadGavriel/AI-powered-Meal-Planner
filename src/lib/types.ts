import type { z } from 'zod';
import type {
  appDataSchema,
  auditEventSchema,
  dietaryProfileSchema,
  householdSchema,
  ingredientSchema,
  invitationSummarySchema,
  memberSchema,
  recipeSchema,
  sessionSchema,
  shoppingListSchema,
  userSchema,
  weeklyMealPlanSchema,
} from './schemas';
export type Role = 'owner' | 'administrator' | 'member';
export type User = z.infer<typeof userSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Household = z.infer<typeof householdSchema>;
export type Member = z.infer<typeof memberSchema>;
export type InvitationSummary = z.infer<typeof invitationSummarySchema>;
export type Invitation = InvitationSummary;
export type DietaryProfile = z.infer<typeof dietaryProfileSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type WeeklyMealPlan = z.infer<typeof weeklyMealPlanSchema>;
export type ShoppingList = z.infer<typeof shoppingListSchema>;
export type ShoppingListItem = ShoppingList['items'][number];
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AppData = z.infer<typeof appDataSchema>;
export type MealEntry = WeeklyMealPlan['entries'][number];
export type RecipeIngredient = Recipe['ingredients'][number];
export type IngredientInput = Omit<Ingredient, 'id' | 'createdAt' | 'updatedAt'>;
export type RecipeInput = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>;
export type PlanInput = Omit<WeeklyMealPlan, 'id' | 'createdAt' | 'updatedAt'>;

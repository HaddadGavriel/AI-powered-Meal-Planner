'use client';
import { z, type ZodType } from 'zod';
import {
  appDataSchema,
  dietaryProfileSchema,
  householdSchema,
  ingredientSchema,
  invitationAcceptanceLinkSchema,
  invitationSchema,
  memberSchema,
  recipeSchema,
  sessionSchema,
  shoppingListSchema,
  weeklyMealPlanSchema,
} from '@/lib/schemas';
import type {
  AppData,
  DietaryProfile,
  Household,
  Ingredient,
  IngredientInput,
  Invitation,
  Member,
  MealEntry,
  PlanInput,
  Recipe,
  RecipeInput,
  Role,
  Session,
  ShoppingList,
  User,
  WeeklyMealPlan,
} from '@/lib/types';
import { createSeedData, createSeedInvitationSecrets, DEMO_ACCOUNTS, DEMO_PASSWORD } from './seed';
export const STORAGE_KEY = 'meal-planner:data:v2';
export const SESSION_KEY = 'meal-planner:session:v2';
export const INVITATION_SECRETS_KEY = 'meal-planner:invitation-secrets:v1';
export const CREDENTIALS_KEY = 'meal-planner:credentials:v1';
const voidSchema = z.undefined();
const authEnvelopeSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  user: memberSchema,
});
const backendErrorSchema = z.object({
  error: z.object({
    code: z.string().default('REQUEST_FAILED'),
    message: z.string(),
    details: z.array(z.object({ field: z.string(), message: z.string() })).default([]),
  }),
});
const copy = <T>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export type RepositoryMode = 'mock' | 'http';
export type RepositoryCapabilities = {
  mode: RepositoryMode;
  canReset: boolean;
};
export class RepositoryError extends Error {
  constructor(
    message: string,
    public code = 'INVALID_OPERATION',
    public details: Array<{
      field: string;
      message: string;
    }> = [],
    public status?: number,
  ) {
    super(message);
  }
}
export interface MealPlannerRepository {
  readonly capabilities: RepositoryCapabilities;
  readonly demo: {
    accounts: typeof DEMO_ACCOUNTS;
    password: string;
  };
  getData(): Promise<AppData>;
  reset(): Promise<void>;
  login(email: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  getSession(): Promise<Session | null>;
  currentUser(): Promise<Member | null>;
  updateProfile(input: Pick<User, 'name' | 'email'>): Promise<Member>;
  updateHousehold(input: Partial<Household>): Promise<Household>;
  updateDietaryProfile(
    memberId: string,
    input: Omit<DietaryProfile, 'id' | 'memberId' | 'updatedAt'>,
  ): Promise<DietaryProfile>;
  invite(email: string, role: Exclude<Role, 'owner'>): Promise<Invitation>;
  resendInvitation(id: string): Promise<Invitation>;
  revokeInvitation(id: string): Promise<void>;
  inspectInvitation(token: string): Promise<Invitation>;
  getInvitationAcceptanceUrl(id: string): Promise<string>;
  acceptInvitation(token: string, name: string, password: string): Promise<Session>;
  changeRole(id: string, role: Role): Promise<Member>;
  removeMember(id: string): Promise<void>;
  createIngredient(input: IngredientInput): Promise<Ingredient>;
  updateIngredient(id: string, input: Partial<IngredientInput>): Promise<Ingredient>;
  deleteIngredient(id: string): Promise<void>;
  createRecipe(input: RecipeInput): Promise<Recipe>;
  updateRecipe(id: string, input: Partial<RecipeInput>): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;
  createPlan(input: PlanInput): Promise<WeeklyMealPlan>;
  updatePlan(id: string, input: Partial<PlanInput>): Promise<WeeklyMealPlan>;
  deletePlan(id: string): Promise<void>;
  upsertMeal(
    planId: string,
    meal: Omit<MealEntry, 'id'> & {
      id?: string;
    },
  ): Promise<WeeklyMealPlan>;
  removeMeal(planId: string, mealId: string): Promise<WeeklyMealPlan>;
  generateShoppingList(planId: string): Promise<ShoppingList>;
  updateShoppingList(id: string, input: Partial<ShoppingList>): Promise<ShoppingList>;
  clearChecked(id: string): Promise<ShoppingList>;
}
function isDateInWeek(date: string, weekStartDate: string) {
  const end = new Date(`${weekStartDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return date >= weekStartDate && date <= end.toISOString().slice(0, 10);
}
export class LocalStorageMealPlannerRepository implements MealPlannerRepository {
  readonly capabilities = { mode: 'mock', canReset: true } as const;
  readonly demo = { accounts: DEMO_ACCOUNTS, password: DEMO_PASSWORD };
  private memory = createSeedData();
  private read(): AppData {
    if (typeof window === 'undefined') return copy(this.memory);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
    const parsed = appDataSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    localStorage.setItem(`${STORAGE_KEY}:corrupt:${Date.now()}`, raw);
    const seed = createSeedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
  private write(candidate: AppData) {
    const validated = appDataSchema.parse(candidate);
    this.memory = copy(validated);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  }
  private actor() {
    if (typeof window === 'undefined') return undefined;
    try {
      return sessionSchema.parse(JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null')).userId;
    } catch {
      return undefined;
    }
  }
  private audit(
    data: AppData,
    action: string,
    entityType: string,
    entityId: string,
    summary: string,
  ) {
    data.auditEvents.unshift({
      id: newId('audit'),
      actorId: this.actor(),
      action,
      entityType,
      entityId,
      timestamp: now(),
      summary,
    });
  }
  private async requireManage() {
    const user = await this.currentUser();
    if (!user || user.role === 'member') {
      throw new RepositoryError('Administrator or owner access is required.', 'FORBIDDEN');
    }
    return user;
  }
  private validateRelationships(data: AppData) {
    if (data.plans.some((plan) => plan.householdId !== data.household.id)) {
      throw new RepositoryError(
        'A meal plan references an unknown household.',
        'INVALID_REFERENCE',
      );
    }
    const memberIds = new Set(data.members.map((member) => member.id));
    if (data.dietaryProfiles.some((profile) => !memberIds.has(profile.memberId))) {
      throw new RepositoryError(
        'A dietary profile references an unknown member.',
        'INVALID_REFERENCE',
      );
    }
    if (
      data.invitations.some(
        (invitation) =>
          invitation.householdId !== data.household.id || !memberIds.has(invitation.invitedBy),
      )
    ) {
      throw new RepositoryError(
        'An invitation references an unknown household or inviter.',
        'INVALID_REFERENCE',
      );
    }
    const ingredientIds = new Set(data.ingredients.map((ingredient) => ingredient.id));
    if (
      data.recipes.some((recipe) =>
        recipe.ingredients.some((row) => !ingredientIds.has(row.ingredientId)),
      )
    ) {
      throw new RepositoryError('A recipe references an unknown ingredient.', 'INVALID_REFERENCE');
    }
    const recipeIds = new Set(data.recipes.map((recipe) => recipe.id));
    if (data.plans.some((plan) => plan.entries.some((entry) => !recipeIds.has(entry.recipeId)))) {
      throw new RepositoryError('A meal entry references an unknown recipe.', 'INVALID_REFERENCE');
    }
    const planIds = new Set(data.plans.map((plan) => plan.id));
    if (
      data.shoppingLists.some(
        (list) => !planIds.has(list.planId) || list.householdId !== data.household.id,
      )
    ) {
      throw new RepositoryError(
        'A shopping list references an unknown plan or household.',
        'INVALID_REFERENCE',
      );
    }
    if (
      data.shoppingLists.some((list) =>
        list.items.some((item) => item.ingredientId && !ingredientIds.has(item.ingredientId)),
      )
    ) {
      throw new RepositoryError(
        'A shopping item references an unknown ingredient.',
        'INVALID_REFERENCE',
      );
    }
  }
  private commit(data: AppData) {
    this.validateRelationships(data);
    this.write(data);
  }
  async getData() {
    return this.read();
  }
  private readInvitationSecrets(): Record<string, string> {
    if (typeof window === 'undefined') return createSeedInvitationSecrets();
    const raw = localStorage.getItem(INVITATION_SECRETS_KEY);
    if (!raw) {
      const seeded = createSeedInvitationSecrets();
      localStorage.setItem(INVITATION_SECRETS_KEY, JSON.stringify(seeded));
      return seeded;
    }
    try {
      return z.record(z.string(), z.string().min(12)).parse(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  private writeInvitationSecrets(secrets: Record<string, string>) {
    if (typeof window !== 'undefined')
      localStorage.setItem(INVITATION_SECRETS_KEY, JSON.stringify(secrets));
  }
  private readCredentials(): Record<string, string> {
    const seeded = Object.fromEntries(
      DEMO_ACCOUNTS.map((account) => [account.email, DEMO_PASSWORD]),
    );
    if (typeof window === 'undefined') return seeded;
    try {
      return {
        ...seeded,
        ...z
          .record(z.string(), z.string().min(8))
          .parse(JSON.parse(localStorage.getItem(CREDENTIALS_KEY) ?? '{}')),
      };
    } catch {
      return seeded;
    }
  }
  private writeCredentials(credentials: Record<string, string>) {
    if (typeof window !== 'undefined')
      localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  }
  async reset() {
    this.write(createSeedData());
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_KEY);
      localStorage.setItem(INVITATION_SECRETS_KEY, JSON.stringify(createSeedInvitationSecrets()));
      localStorage.removeItem(CREDENTIALS_KEY);
    }
  }
  async login(email: string, password: string) {
    const data = this.read();
    const member = data.members.find(
      (candidate) => candidate.email.toLowerCase() === email.toLowerCase(),
    );
    if (!member || this.readCredentials()[member.email.toLowerCase()] !== password) {
      throw new RepositoryError('Email or password is incorrect.', 'INVALID_CREDENTIALS');
    }
    const session = sessionSchema.parse({
      userId: member.id,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.audit(data, 'auth.signed_in', 'user', member.id, `${member.name} signed in.`);
    this.commit(data);
    return session;
  }
  async logout() {
    if (typeof window !== 'undefined') localStorage.removeItem(SESSION_KEY);
  }
  async getSession() {
    if (typeof window === 'undefined') return null;
    try {
      const session = sessionSchema.parse(JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null'));
      if (Date.parse(session.expiresAt) <= Date.now()) {
        await this.logout();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }
  async currentUser() {
    const session = await this.getSession();
    return session
      ? (this.read().members.find((member) => member.id === session.userId) ?? null)
      : null;
  }
  async updateProfile(input: Pick<User, 'name' | 'email'>) {
    const data = this.read();
    const current = await this.currentUser();
    const member = data.members.find((candidate) => candidate.id === current?.id);
    if (!member) throw new RepositoryError('Sign in first.', 'UNAUTHORIZED');
    if (
      data.members.some(
        (candidate) =>
          candidate.id !== member.id && candidate.email.toLowerCase() === input.email.toLowerCase(),
      )
    ) {
      throw new RepositoryError('That email is already in use.', 'DUPLICATE');
    }
    const updated = memberSchema.parse({
      ...member,
      ...input,
      avatarInitials: input.name
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    });
    data.members[data.members.indexOf(member)] = updated;
    this.audit(data, 'profile.updated', 'user', updated.id, 'Updated personal profile.');
    this.commit(data);
    return updated;
  }
  async updateHousehold(input: Partial<Household>) {
    await this.requireManage();
    const data = this.read();
    const household = householdSchema.parse({
      ...data.household,
      ...input,
      id: data.household.id,
      updatedAt: now(),
    });
    data.household = household;
    this.audit(data, 'household.updated', 'household', household.id, 'Updated household details.');
    this.commit(data);
    return household;
  }
  async updateDietaryProfile(
    memberId: string,
    input: Omit<DietaryProfile, 'id' | 'memberId' | 'updatedAt'>,
  ) {
    const user = await this.currentUser();
    if (!user || (user.id !== memberId && user.role === 'member')) {
      throw new RepositoryError('You may only edit your own dietary profile.', 'FORBIDDEN');
    }
    const data = this.read();
    if (!data.members.some((member) => member.id === memberId)) {
      throw new RepositoryError('Member not found.', 'NOT_FOUND');
    }
    const index = data.dietaryProfiles.findIndex((profile) => profile.memberId === memberId);
    const profile = dietaryProfileSchema.parse({
      id: index < 0 ? newId('diet') : data.dietaryProfiles[index].id,
      memberId,
      ...input,
      updatedAt: now(),
    });
    if (index < 0) data.dietaryProfiles.push(profile);
    else data.dietaryProfiles[index] = profile;
    this.audit(
      data,
      'dietary.updated',
      'dietary_profile',
      profile.id,
      'Updated user-supplied dietary preferences.',
    );
    this.commit(data);
    return profile;
  }
  async invite(email: string, proposedRole: Exclude<Role, 'owner'>) {
    const user = await this.requireManage();
    const data = this.read();
    const normalizedEmail = email.toLowerCase();
    if (
      data.members.some((member) => member.email.toLowerCase() === normalizedEmail) ||
      data.invitations.some(
        (invitation) =>
          invitation.email.toLowerCase() === normalizedEmail && invitation.status === 'pending',
      )
    ) {
      throw new RepositoryError(
        'This person is already a member or has a pending invitation.',
        'DUPLICATE',
      );
    }
    const createdAt = now();
    const invitation = invitationSchema.parse({
      id: newId('inv'),
      householdId: data.household.id,
      email: normalizedEmail,
      proposedRole,
      invitedBy: user.id,
      createdAt,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      status: 'pending',
    });
    data.invitations.push(invitation);
    const secrets = this.readInvitationSecrets();
    secrets[invitation.id] = newId('token');
    this.writeInvitationSecrets(secrets);
    this.audit(
      data,
      'invitation.created',
      'invitation',
      invitation.id,
      `Invited ${normalizedEmail} as ${proposedRole}.`,
    );
    this.commit(data);
    return invitation;
  }
  async resendInvitation(invitationId: string) {
    await this.requireManage();
    const data = this.read();
    const existing = data.invitations.find((invitation) => invitation.id === invitationId);
    if (!existing || existing.status !== 'pending')
      throw new RepositoryError('Only pending invitations can be resent.');
    const invitation = invitationSchema.parse({
      ...existing,
      createdAt: now(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    data.invitations[data.invitations.indexOf(existing)] = invitation;
    const secrets = this.readInvitationSecrets();
    secrets[invitation.id] = newId('token');
    this.writeInvitationSecrets(secrets);
    this.audit(
      data,
      'invitation.resent',
      'invitation',
      invitation.id,
      `Resent invitation to ${invitation.email}.`,
    );
    this.commit(data);
    return invitation;
  }
  async revokeInvitation(invitationId: string) {
    await this.requireManage();
    const data = this.read();
    const existing = data.invitations.find((invitation) => invitation.id === invitationId);
    if (!existing || existing.status !== 'pending')
      throw new RepositoryError('Only pending invitations can be revoked.');
    data.invitations[data.invitations.indexOf(existing)] = invitationSchema.parse({
      ...existing,
      status: 'revoked',
    });
    this.audit(
      data,
      'invitation.revoked',
      'invitation',
      existing.id,
      `Revoked invitation for ${existing.email}.`,
    );
    this.commit(data);
  }
  async inspectInvitation(token: string) {
    const data = this.read();
    const secrets = this.readInvitationSecrets();
    const invitationId = Object.entries(secrets).find(([, secret]) => secret === token)?.[0];
    const existing = data.invitations.find((invitation) => invitation.id === invitationId);
    if (!existing) throw new RepositoryError('Invitation not found.', 'NOT_FOUND');
    if (existing.status === 'pending' && Date.parse(existing.expiresAt) < Date.now()) {
      const expired = invitationSchema.parse({ ...existing, status: 'expired' });
      data.invitations[data.invitations.indexOf(existing)] = expired;
      this.commit(data);
      return expired;
    }
    return existing;
  }
  async getInvitationAcceptanceUrl(invitationId: string) {
    await this.requireManage();
    const invitation = this.read().invitations.find((candidate) => candidate.id === invitationId);
    if (!invitation || invitation.status !== 'pending')
      throw new RepositoryError(
        'Only pending invitations have an acceptance link.',
        'INVITATION_UNAVAILABLE',
      );
    const token = this.readInvitationSecrets()[invitationId];
    if (!token)
      throw new RepositoryError('Invitation token not found. Resend the invitation.', 'NOT_FOUND');
    return `/invite/${encodeURIComponent(token)}`;
  }
  async acceptInvitation(token: string, name: string, password: string) {
    if (password.length < 8)
      throw new RepositoryError(
        'Password must contain at least 8 characters.',
        'VALIDATION_ERROR',
        [{ field: 'password', message: 'Use at least 8 characters.' }],
      );
    const inspected = await this.inspectInvitation(token);
    if (inspected.status !== 'pending')
      throw new RepositoryError(
        `This invitation is ${inspected.status}.`,
        'INVITATION_UNAVAILABLE',
      );
    const data = this.read();
    if (
      data.members.some((member) => member.email.toLowerCase() === inspected.email.toLowerCase())
    ) {
      throw new RepositoryError('This email already belongs to a household member.', 'DUPLICATE');
    }
    const invitation = data.invitations.find((candidate) => candidate.id === inspected.id);
    if (!invitation || invitation.status !== 'pending')
      throw new RepositoryError('This invitation has already been used.', 'INVITATION_UNAVAILABLE');
    const member = memberSchema.parse({
      id: newId('user'),
      name,
      email: invitation.email,
      avatarInitials: name
        .split(/\s+/)
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
      role: invitation.proposedRole,
      status: 'active',
      joinedAt: now(),
    });
    data.invitations[data.invitations.indexOf(invitation)] = invitationSchema.parse({
      ...invitation,
      status: 'accepted',
      acceptedAt: now(),
    });
    data.members.push(member);
    data.dietaryProfiles.push(
      dietaryProfileSchema.parse({
        id: newId('diet'),
        memberId: member.id,
        dietaryPatterns: [],
        allergens: [],
        excludedIngredients: [],
        preferences: '',
        updatedAt: now(),
      }),
    );
    this.audit(
      data,
      'invitation.accepted',
      'invitation',
      invitation.id,
      `${invitation.email} joined the household.`,
    );
    this.commit(data);
    const credentials = this.readCredentials();
    credentials[member.email.toLowerCase()] = password;
    this.writeCredentials(credentials);
    const session = sessionSchema.parse({
      userId: member.id,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }
  async changeRole(memberId: string, role: Role) {
    const user = await this.requireManage();
    const data = this.read();
    const existing = data.members.find((member) => member.id === memberId);
    if (!existing) throw new RepositoryError('Member not found.', 'NOT_FOUND');
    if ((existing.role === 'owner' || role === 'owner') && user.role !== 'owner')
      throw new RepositoryError('Only an owner may manage owner roles.', 'FORBIDDEN');
    if (
      existing.role === 'owner' &&
      role !== 'owner' &&
      data.members.filter((member) => member.role === 'owner').length === 1
    )
      throw new RepositoryError('Cannot demote the only owner.', 'ONLY_OWNER');
    const member = memberSchema.parse({ ...existing, role });
    data.members[data.members.indexOf(existing)] = member;
    this.audit(
      data,
      'member.role_changed',
      'member',
      member.id,
      `Changed ${member.name} to ${role}.`,
    );
    this.commit(data);
    return member;
  }
  async removeMember(memberId: string) {
    const user = await this.requireManage();
    const data = this.read();
    const member = data.members.find((candidate) => candidate.id === memberId);
    if (!member) throw new RepositoryError('Member not found.', 'NOT_FOUND');
    if (
      member.role === 'owner' &&
      (user.role !== 'owner' ||
        data.members.filter((candidate) => candidate.role === 'owner').length === 1)
    )
      throw new RepositoryError('Cannot remove the only owner.', 'ONLY_OWNER');
    data.members = data.members.filter((candidate) => candidate.id !== memberId);
    data.dietaryProfiles = data.dietaryProfiles.filter((profile) => profile.memberId !== memberId);
    this.audit(data, 'member.removed', 'member', memberId, `Removed ${member.name}.`);
    this.commit(data);
  }
  async createIngredient(input: IngredientInput) {
    await this.requireManage();
    const data = this.read();
    if (
      data.ingredients.some(
        (ingredient) => ingredient.name.toLowerCase() === input.name.toLowerCase(),
      )
    )
      throw new RepositoryError('An ingredient with this name already exists.', 'DUPLICATE');
    const ingredient = ingredientSchema.parse({
      ...input,
      id: newId('ing'),
      createdAt: now(),
      updatedAt: now(),
    });
    data.ingredients.push(ingredient);
    this.audit(
      data,
      'ingredient.created',
      'ingredient',
      ingredient.id,
      `Created ${ingredient.name}.`,
    );
    this.commit(data);
    return ingredient;
  }
  async updateIngredient(ingredientId: string, input: Partial<IngredientInput>) {
    await this.requireManage();
    const data = this.read();
    const existing = data.ingredients.find((ingredient) => ingredient.id === ingredientId);
    if (!existing) throw new RepositoryError('Ingredient not found.', 'NOT_FOUND');
    if (
      input.name &&
      data.ingredients.some(
        (ingredient) =>
          ingredient.id !== ingredientId &&
          ingredient.name.toLowerCase() === input.name!.toLowerCase(),
      )
    )
      throw new RepositoryError('An ingredient with this name already exists.', 'DUPLICATE');
    const ingredient = ingredientSchema.parse({
      ...existing,
      ...input,
      id: ingredientId,
      updatedAt: now(),
    });
    data.ingredients[data.ingredients.indexOf(existing)] = ingredient;
    this.audit(
      data,
      'ingredient.updated',
      'ingredient',
      ingredient.id,
      `Updated ${ingredient.name}.`,
    );
    this.commit(data);
    return ingredient;
  }
  async deleteIngredient(ingredientId: string) {
    await this.requireManage();
    const data = this.read();
    if (!data.ingredients.some((ingredient) => ingredient.id === ingredientId))
      throw new RepositoryError('Ingredient not found.', 'NOT_FOUND');
    if (
      data.recipes.some((recipe) =>
        recipe.ingredients.some((row) => row.ingredientId === ingredientId),
      )
    )
      throw new RepositoryError(
        'Archive this ingredient instead; one or more recipes reference it.',
        'REFERENCED',
      );
    data.ingredients = data.ingredients.filter((ingredient) => ingredient.id !== ingredientId);
    this.audit(
      data,
      'ingredient.deleted',
      'ingredient',
      ingredientId,
      'Deleted an unreferenced ingredient.',
    );
    this.commit(data);
  }
  private validateRecipeReferences(data: AppData, recipe: Recipe) {
    if (
      recipe.ingredients.some(
        (row) => !data.ingredients.some((ingredient) => ingredient.id === row.ingredientId),
      )
    )
      throw new RepositoryError('A recipe ingredient no longer exists.', 'INVALID_REFERENCE');
  }
  async createRecipe(input: RecipeInput) {
    await this.requireManage();
    const data = this.read();
    const recipe = recipeSchema.parse({
      ...input,
      id: newId('rec'),
      createdAt: now(),
      updatedAt: now(),
    });
    this.validateRecipeReferences(data, recipe);
    data.recipes.push(recipe);
    this.audit(data, 'recipe.created', 'recipe', recipe.id, `Created ${recipe.name}.`);
    this.commit(data);
    return recipe;
  }
  async updateRecipe(recipeId: string, input: Partial<RecipeInput>) {
    await this.requireManage();
    const data = this.read();
    const existing = data.recipes.find((recipe) => recipe.id === recipeId);
    if (!existing) throw new RepositoryError('Recipe not found.', 'NOT_FOUND');
    const recipe = recipeSchema.parse({ ...existing, ...input, id: recipeId, updatedAt: now() });
    this.validateRecipeReferences(data, recipe);
    data.recipes[data.recipes.indexOf(existing)] = recipe;
    this.audit(data, 'recipe.updated', 'recipe', recipe.id, `Updated ${recipe.name}.`);
    this.commit(data);
    return recipe;
  }
  async deleteRecipe(recipeId: string) {
    await this.requireManage();
    const data = this.read();
    if (!data.recipes.some((recipe) => recipe.id === recipeId))
      throw new RepositoryError('Recipe not found.', 'NOT_FOUND');
    if (data.plans.some((plan) => plan.entries.some((entry) => entry.recipeId === recipeId)))
      throw new RepositoryError(
        'Archive this recipe instead; a meal plan references it.',
        'REFERENCED',
      );
    data.recipes = data.recipes.filter((recipe) => recipe.id !== recipeId);
    this.audit(data, 'recipe.deleted', 'recipe', recipeId, 'Deleted an unreferenced recipe.');
    this.commit(data);
  }
  private validatePlan(data: AppData, plan: WeeklyMealPlan) {
    if (plan.householdId !== data.household.id)
      throw new RepositoryError('Plan household does not exist.', 'INVALID_REFERENCE');
    if (plan.entries.some((entry) => !isDateInWeek(entry.date, plan.weekStartDate)))
      throw new RepositoryError(
        'Move or remove meals outside the new week before changing the week start.',
        'ENTRY_OUTSIDE_WEEK',
      );
    if (plan.entries.some((entry) => !data.recipes.some((recipe) => recipe.id === entry.recipeId)))
      throw new RepositoryError('A meal references an unavailable recipe.', 'INVALID_REFERENCE');
  }
  async createPlan(input: PlanInput) {
    await this.requireManage();
    const data = this.read();
    const plan = weeklyMealPlanSchema.parse({
      ...input,
      id: newId('plan'),
      createdAt: now(),
      updatedAt: now(),
    });
    this.validatePlan(data, plan);
    data.plans.push(plan);
    this.audit(data, 'plan.created', 'meal_plan', plan.id, `Created ${plan.name}.`);
    this.commit(data);
    return plan;
  }
  async updatePlan(planId: string, input: Partial<PlanInput>) {
    await this.requireManage();
    const data = this.read();
    const existing = data.plans.find((plan) => plan.id === planId);
    if (!existing) throw new RepositoryError('Plan not found.', 'NOT_FOUND');
    const plan = weeklyMealPlanSchema.parse({
      ...existing,
      ...input,
      id: planId,
      updatedAt: now(),
    });
    this.validatePlan(data, plan);
    data.plans[data.plans.indexOf(existing)] = plan;
    this.audit(data, 'plan.updated', 'meal_plan', plan.id, `Updated ${plan.name}.`);
    this.commit(data);
    return plan;
  }
  async deletePlan(planId: string) {
    await this.requireManage();
    const data = this.read();
    if (!data.plans.some((plan) => plan.id === planId))
      throw new RepositoryError('Plan not found.', 'NOT_FOUND');
    data.plans = data.plans.filter((plan) => plan.id !== planId);
    data.shoppingLists = data.shoppingLists.filter((list) => list.planId !== planId);
    this.audit(
      data,
      'plan.deleted',
      'meal_plan',
      planId,
      'Deleted a plan and its generated shopping list.',
    );
    this.commit(data);
  }
  async upsertMeal(
    planId: string,
    input: Omit<MealEntry, 'id'> & {
      id?: string;
    },
  ) {
    await this.requireManage();
    const data = this.read();
    const existing = data.plans.find((plan) => plan.id === planId);
    if (!existing) throw new RepositoryError('Plan not found.', 'NOT_FOUND');
    if (!data.recipes.some((recipe) => recipe.id === input.recipeId))
      throw new RepositoryError('Select an available recipe.', 'INVALID_REFERENCE');
    const entry = { ...input, id: input.id ?? newId('meal') } as MealEntry;
    const plan = weeklyMealPlanSchema.parse({
      ...existing,
      entries: existing.entries.filter((candidate) => candidate.id !== entry.id).concat(entry),
      updatedAt: now(),
    });
    this.validatePlan(data, plan);
    data.plans[data.plans.indexOf(existing)] = plan;
    this.audit(
      data,
      'meal.upserted',
      'meal_plan',
      plan.id,
      `Added or updated a ${entry.mealType} meal.`,
    );
    this.commit(data);
    return plan;
  }
  async removeMeal(planId: string, mealId: string) {
    await this.requireManage();
    const data = this.read();
    const existing = data.plans.find((plan) => plan.id === planId);
    if (!existing) throw new RepositoryError('Plan not found.', 'NOT_FOUND');
    if (!existing.entries.some((entry) => entry.id === mealId))
      throw new RepositoryError('Meal not found.', 'NOT_FOUND');
    const plan = weeklyMealPlanSchema.parse({
      ...existing,
      entries: existing.entries.filter((entry) => entry.id !== mealId),
      updatedAt: now(),
    });
    data.plans[data.plans.indexOf(existing)] = plan;
    this.audit(data, 'meal.removed', 'meal_plan', plan.id, 'Removed a meal.');
    this.commit(data);
    return plan;
  }
  async generateShoppingList(planId: string) {
    await this.requireManage();
    const data = this.read();
    const plan = data.plans.find((candidate) => candidate.id === planId);
    if (!plan) throw new RepositoryError('Plan not found.', 'NOT_FOUND');
    const old = data.shoppingLists.find((list) => list.planId === planId);
    const manual = old?.items.filter((item) => item.source === 'manual') ?? [];
    const checked = new Map(
      old?.items
        .filter((item) => item.source === 'generated')
        .map((item) => [`${item.ingredientId}|${item.unit.trim().toLowerCase()}`, item.checked]),
    );
    const generated = new Map<string, ShoppingList['items'][number]>();
    for (const meal of plan.entries) {
      const recipe = data.recipes.find((candidate) => candidate.id === meal.recipeId);
      if (!recipe)
        throw new RepositoryError('A planned recipe no longer exists.', 'INVALID_REFERENCE');
      for (const row of recipe.ingredients) {
        const ingredient = data.ingredients.find((candidate) => candidate.id === row.ingredientId);
        if (!ingredient)
          throw new RepositoryError('A recipe ingredient no longer exists.', 'INVALID_REFERENCE');
        const unit = row.unit.trim().toLowerCase();
        const key = `${ingredient.id}|${unit}`;
        const quantity = (row.quantity * meal.servingCount) / recipe.servings;
        const existing = generated.get(key);
        if (existing) existing.quantity += quantity;
        else
          generated.set(key, {
            id: newId('shop'),
            ingredientId: ingredient.id,
            name: ingredient.name,
            category: ingredient.category,
            quantity,
            unit: row.unit.trim(),
            checked: checked.get(key) ?? false,
            source: 'generated',
          });
      }
    }
    const list = shoppingListSchema.parse({
      id: old?.id ?? newId('list'),
      householdId: data.household.id,
      planId,
      name: `${plan.name} groceries`,
      items: [...generated.values(), ...manual].sort(
        (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
      ),
      createdAt: old?.createdAt ?? now(),
      updatedAt: now(),
    });
    data.shoppingLists = data.shoppingLists
      .filter((candidate) => candidate.planId !== planId)
      .concat(list);
    this.audit(
      data,
      'shopping.generated',
      'shopping_list',
      list.id,
      `Generated shopping list from ${plan.name}.`,
    );
    this.commit(data);
    return list;
  }
  async updateShoppingList(listId: string, input: Partial<ShoppingList>) {
    await this.requireManage();
    const data = this.read();
    const existing = data.shoppingLists.find((list) => list.id === listId);
    if (!existing) throw new RepositoryError('Shopping list not found.', 'NOT_FOUND');
    const list = shoppingListSchema.parse({
      ...existing,
      ...input,
      id: listId,
      householdId: existing.householdId,
      planId: existing.planId,
      updatedAt: now(),
    });
    data.shoppingLists[data.shoppingLists.indexOf(existing)] = list;
    this.audit(data, 'shopping.updated', 'shopping_list', list.id, 'Updated shopping list items.');
    this.commit(data);
    return list;
  }
  async clearChecked(listId: string) {
    await this.requireManage();
    const data = this.read();
    const list = data.shoppingLists.find((candidate) => candidate.id === listId);
    if (!list) throw new RepositoryError('Shopping list not found.', 'NOT_FOUND');
    return this.updateShoppingList(listId, { items: list.items.filter((item) => !item.checked) });
  }
}
export class HttpMealPlannerRepository implements MealPlannerRepository {
  readonly capabilities = { mode: 'http', canReset: false } as const;
  readonly demo = { accounts: DEMO_ACCOUNTS, password: DEMO_PASSWORD };
  private accessToken: string | null = null;
  private session: Session | null = null;
  private refreshPromise: Promise<Session | null> | null = null;
  constructor(
    private base = '/api/v1',
    private fetcher: typeof fetch = fetch,
  ) {}
  private async decode<T>(response: Response, schema: ZodType<T>): Promise<T> {
    if (response.status === 204) {
      if (schema !== (voidSchema as unknown as ZodType<T>))
        throw new RepositoryError(
          'Backend returned no content where data was required.',
          'INVALID_RESPONSE',
          [],
          204,
        );
      return undefined as T;
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new RepositoryError(
        'Backend returned invalid JSON.',
        'INVALID_RESPONSE',
        [],
        response.status,
      );
    }
    if (!response.ok) {
      const parsed = backendErrorSchema.safeParse(json);
      if (parsed.success)
        throw new RepositoryError(
          parsed.data.error.message,
          parsed.data.error.code,
          parsed.data.error.details,
          response.status,
        );
      throw new RepositoryError(
        `Request failed (${response.status}).`,
        'REQUEST_FAILED',
        [],
        response.status,
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success)
      throw new RepositoryError(
        'Backend response did not match the documented schema.',
        'INVALID_RESPONSE',
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
        response.status,
      );
    return parsed.data;
  }
  private async raw<T>(
    path: string,
    schema: ZodType<T>,
    init: RequestInit = {},
    protectedRequest = true,
  ) {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (protectedRequest && this.accessToken)
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    const response = await this.fetcher(`${this.base}${path}`, {
      ...init,
      credentials: 'include',
      headers,
    });
    return this.decode(response, schema);
  }
  private async refresh() {
    if (!this.refreshPromise) {
      this.refreshPromise = this.raw('/auth/refresh', authEnvelopeSchema, { method: 'POST' }, false)
        .then((envelope) => {
          this.accessToken = envelope.accessToken;
          this.session = sessionSchema.parse({
            userId: envelope.user.id,
            expiresAt: envelope.expiresAt,
          });
          return this.session;
        })
        .catch((error) => {
          this.accessToken = null;
          this.session = null;
          if (error instanceof RepositoryError && error.status === 401) return null;
          throw error;
        })
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }
  private async request<T>(
    path: string,
    schema: ZodType<T>,
    init: RequestInit = {},
    protectedRequest = true,
  ): Promise<T> {
    if (protectedRequest && !this.accessToken && !(await this.refresh()))
      throw new RepositoryError(
        'Your session has expired. Sign in again.',
        'UNAUTHORIZED',
        [],
        401,
      );
    try {
      return await this.raw(path, schema, init, protectedRequest);
    } catch (error) {
      if (
        protectedRequest &&
        error instanceof RepositoryError &&
        error.status === 401 &&
        (await this.refresh())
      )
        return this.raw(path, schema, init, true);
      throw error;
    }
  }
  async getData() {
    return this.request('/bootstrap', appDataSchema);
  }
  async reset() {
    throw new RepositoryError('Reset is available only in mock mode.', 'UNSUPPORTED');
  }
  async login(email: string, password: string) {
    const envelope = await this.raw(
      '/auth/login',
      authEnvelopeSchema,
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    );
    this.accessToken = envelope.accessToken;
    this.session = sessionSchema.parse({ userId: envelope.user.id, expiresAt: envelope.expiresAt });
    return this.session;
  }
  async logout() {
    await this.request('/auth/logout', voidSchema, { method: 'POST' });
    this.accessToken = null;
    this.session = null;
  }
  async getSession() {
    if (this.session && Date.parse(this.session.expiresAt) > Date.now()) return this.session;
    return this.refresh();
  }
  async currentUser() {
    if (!(await this.getSession())) return null;
    return this.request('/users/me', memberSchema);
  }
  async updateProfile(input: Pick<User, 'name' | 'email'>) {
    return this.request('/users/me', memberSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }
  async updateHousehold(input: Partial<Household>) {
    return this.request('/household', householdSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }
  async updateDietaryProfile(
    id: string,
    input: Omit<DietaryProfile, 'id' | 'memberId' | 'updatedAt'>,
  ) {
    return this.request(`/household/members/${id}/dietary-profile`, dietaryProfileSchema, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  }
  async invite(email: string, proposedRole: Exclude<Role, 'owner'>) {
    return this.request('/household/invitations', invitationSchema, {
      method: 'POST',
      body: JSON.stringify({ email, proposedRole }),
    });
  }
  async resendInvitation(id: string) {
    return this.request(`/household/invitations/${id}/resend`, invitationSchema, {
      method: 'POST',
    });
  }
  async revokeInvitation(id: string) {
    return this.request(`/household/invitations/${id}`, voidSchema, { method: 'DELETE' });
  }
  async inspectInvitation(token: string) {
    return this.raw(`/invitations/${token}`, invitationSchema, {}, false);
  }
  async getInvitationAcceptanceUrl(id: string) {
    const result = await this.request(
      `/household/invitations/${id}/acceptance-link`,
      invitationAcceptanceLinkSchema,
      { method: 'POST' },
    );
    return result.acceptanceUrl;
  }
  async acceptInvitation(token: string, name: string, password: string) {
    const envelope = await this.raw(
      `/invitations/${token}/accept`,
      authEnvelopeSchema,
      { method: 'POST', body: JSON.stringify({ name, password }) },
      false,
    );
    this.accessToken = envelope.accessToken;
    this.session = sessionSchema.parse({ userId: envelope.user.id, expiresAt: envelope.expiresAt });
    return this.session;
  }
  async changeRole(id: string, role: Role) {
    return this.request(`/household/members/${id}`, memberSchema, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }
  async removeMember(id: string) {
    return this.request(`/household/members/${id}`, voidSchema, { method: 'DELETE' });
  }
  async createIngredient(input: IngredientInput) {
    return this.request('/ingredients', ingredientSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  async updateIngredient(id: string, input: Partial<IngredientInput>) {
    return this.request(`/ingredients/${id}`, ingredientSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }
  async deleteIngredient(id: string) {
    return this.request(`/ingredients/${id}`, voidSchema, { method: 'DELETE' });
  }
  async createRecipe(input: RecipeInput) {
    return this.request('/recipes', recipeSchema, { method: 'POST', body: JSON.stringify(input) });
  }
  async updateRecipe(id: string, input: Partial<RecipeInput>) {
    return this.request(`/recipes/${id}`, recipeSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }
  async deleteRecipe(id: string) {
    return this.request(`/recipes/${id}`, voidSchema, { method: 'DELETE' });
  }
  async createPlan(input: PlanInput) {
    return this.request('/meal-plans', weeklyMealPlanSchema, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  async updatePlan(id: string, input: Partial<PlanInput>) {
    return this.request(`/meal-plans/${id}`, weeklyMealPlanSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }
  async deletePlan(id: string) {
    return this.request(`/meal-plans/${id}`, voidSchema, { method: 'DELETE' });
  }
  async upsertMeal(
    planId: string,
    input: Omit<MealEntry, 'id'> & {
      id?: string;
    },
  ) {
    return this.request(
      `/meal-plans/${planId}/entries${input.id ? `/${input.id}` : ''}`,
      weeklyMealPlanSchema,
      { method: input.id ? 'PATCH' : 'POST', body: JSON.stringify(input) },
    );
  }
  async removeMeal(planId: string, mealId: string) {
    return this.request(`/meal-plans/${planId}/entries/${mealId}`, weeklyMealPlanSchema, {
      method: 'DELETE',
    });
  }
  async generateShoppingList(planId: string) {
    return this.request(`/meal-plans/${planId}/shopping-list`, shoppingListSchema, {
      method: 'POST',
    });
  }
  async updateShoppingList(id: string, input: Partial<ShoppingList>) {
    return this.request(`/shopping-lists/${id}`, shoppingListSchema, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }
  async clearChecked(id: string) {
    return this.request(`/shopping-lists/${id}/checked`, shoppingListSchema, { method: 'DELETE' });
  }
}
export function createRepository(): MealPlannerRepository {
  return process.env.NEXT_PUBLIC_MEAL_PLANNER_DATA_MODE === 'http'
    ? new HttpMealPlannerRepository(process.env.NEXT_PUBLIC_MEAL_PLANNER_API_URL || '/api/v1')
    : new LocalStorageMealPlannerRepository();
}

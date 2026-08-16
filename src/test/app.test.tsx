import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { appDataSchema } from '@/lib/schemas';
import {
  HttpMealPlannerRepository,
  LocalStorageMealPlannerRepository,
  STORAGE_KEY,
} from '@/data/repository';
import { createSeedData, seedData } from '@/data/seed';
import { calendarDateInTimeZone, formatCalendarDate } from '@/lib/calendar';
import { RecipeForm, MealForm } from '@/components/Forms';
import { RepositoryProvider } from '@/data/RepositoryProvider';
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
async function signedIn(email = 'owner@mealplanner.dev') {
  const repository = new LocalStorageMealPlannerRepository();
  await repository.reset();
  await repository.login(email, 'mealplanner-demo');
  return repository;
}
async function acceptanceToken(
  repository: LocalStorageMealPlannerRepository,
  invitationId: string,
) {
  const url = await repository.getInvitationAcceptanceUrl(invitationId);
  return decodeURIComponent(url.split('/').at(-1)!);
}
beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});
describe('schemas and seed relationships', () => {
  it('validates the complete seed and every reference', () => {
    expect(appDataSchema.safeParse(seedData).success).toBe(true);
    const ingredients = new Set(seedData.ingredients.map((item) => item.id));
    const recipes = new Set(seedData.recipes.map((item) => item.id));
    expect(
      seedData.recipes.every((recipe) =>
        recipe.ingredients.every((row) => ingredients.has(row.ingredientId)),
      ),
    ).toBe(true);
    expect(
      seedData.plans.every((plan) => plan.entries.every((entry) => recipes.has(entry.recipeId))),
    ).toBe(true);
  });
  it('never includes invitation tokens in member bootstrap data', async () => {
    const repository = await signedIn('member@mealplanner.dev');
    expect(JSON.stringify(await repository.getData())).not.toContain('demo-casey-token');
    expect((await repository.getData()).invitations[0]).not.toHaveProperty('token');
    await expect(repository.getInvitationAcceptanceUrl('inv-casey')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('creates a usable pending invitation relative to reset time', () => {
    const reference = Date.UTC(2042, 0, 1);
    const invitation = createSeedData(reference).invitations[0];
    expect(invitation.status).toBe('pending');
    expect(Date.parse(invitation.expiresAt)).toBe(reference + 7 * 86400000);
  });
});
describe('local repository integrity and authorization', () => {
  it.each(['owner@mealplanner.dev', 'admin@mealplanner.dev', 'member@mealplanner.dev'])(
    'migrates credentials when %s changes email',
    async (email) => {
      const repository = await signedIn(email);
      const changed = `changed-${email}`;
      await repository.updateProfile({
        name: 'Changed Person',
        email: ` ${changed.toUpperCase()} `,
      });
      await repository.logout();
      await expect(repository.login(email, 'mealplanner-demo')).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
      await expect(repository.login(changed, 'mealplanner-demo')).resolves.toBeTruthy();
    },
  );
  it('migrates invitation-created credentials and rejects a pending invitation collision', async () => {
    const repository = await signedIn();
    const accepted = await repository.invite('invited@example.com', 'member');
    const token = await acceptanceToken(repository, accepted.id);
    await repository.acceptInvitation(token, 'Invited Person', 'invite-password');
    await repository.updateProfile({ name: 'Invited Person', email: 'moved@example.com' });
    await repository.logout();
    await expect(repository.login('invited@example.com', 'invite-password')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await repository.login('moved@example.com', 'invite-password');
    await repository.logout();
    await repository.login('owner@mealplanner.dev', 'mealplanner-demo');
    await repository.invite('reserved@example.com', 'member');
    await expect(
      repository.updateProfile({ name: 'Avery Stone', email: ' RESERVED@example.com ' }),
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
  });
  it('transfers ownership and removes the former owner without rewriting invitation history', async () => {
    const repository = await signedIn();
    const originalInviter = (await repository.getData()).invitations[0].invitedBy;
    await repository.changeRole('user-member', 'owner');
    await repository.logout();
    await repository.login('member@mealplanner.dev', 'mealplanner-demo');
    await repository.removeMember('user-owner');
    const data = await repository.getData();
    expect(data.members.some((member) => member.id === 'user-owner')).toBe(false);
    expect(data.invitations[0].invitedBy).toBe(originalInviter);
  });
  it('recovers corrupt storage without reading it during server rendering', async () => {
    localStorage.setItem(STORAGE_KEY, 'bad json');
    const repository = new LocalStorageMealPlannerRepository();
    expect((await repository.getData()).version).toBe(2);
    expect(
      [...Array(localStorage.length)].some((_, index) =>
        localStorage.key(index)?.includes(':corrupt:'),
      ),
    ).toBe(true);
  });
  it('rejects member meal and shopping mutations', async () => {
    const repository = await signedIn('member@mealplanner.dev');
    await expect(
      repository.upsertMeal('plan-current', {
        date: '2026-08-04',
        mealType: 'dinner',
        recipeId: 'rec-pasta',
        servingCount: 2,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(repository.removeMeal('plan-current', 'meal-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(repository.clearChecked('list-current')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('rejects moving a plan week around existing entries without changing storage', async () => {
    const repository = await signedIn();
    const before = localStorage.getItem(STORAGE_KEY);
    await expect(
      repository.updatePlan('plan-current', { weekStartDate: '2026-09-07' }),
    ).rejects.toMatchObject({ code: 'ENTRY_OUTSIDE_WEEK' });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  });
  it('rejects invalid shopping values without corrupting or resetting data', async () => {
    const repository = await signedIn();
    const before = localStorage.getItem(STORAGE_KEY);
    const list = (await repository.getData()).shoppingLists[0];
    await expect(
      repository.updateShoppingList(list.id, {
        items: list.items.map((item, index) => (index === 0 ? { ...item, quantity: 0 } : item)),
      }),
    ).rejects.toThrow();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect((await repository.getData()).shoppingLists[0].items[0].quantity).toBeGreaterThan(0);
  });
  it('enforces references and the only-owner invariant', async () => {
    const repository = await signedIn();
    await expect(repository.deleteIngredient('ing-pasta')).rejects.toMatchObject({
      code: 'REFERENCED',
    });
    await expect(repository.deleteRecipe('rec-pasta')).rejects.toMatchObject({
      code: 'REFERENCED',
    });
    await expect(repository.changeRole('user-owner', 'member')).rejects.toMatchObject({
      code: 'ONLY_OWNER',
    });
    await expect(repository.removeMember('user-owner')).rejects.toMatchObject({
      code: 'ONLY_OWNER',
    });
  });
  it('prevents an administrator from managing an owner', async () => {
    const repository = await signedIn('admin@mealplanner.dev');
    await expect(repository.changeRole('user-owner', 'member')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(repository.removeMember('user-owner')).rejects.toMatchObject({
      code: 'ONLY_OWNER',
    });
  });
});
describe('calendar dates and archived form references', () => {
  it('computes household dates deterministically on both sides of UTC', () => {
    const instant = new Date('2026-08-13T02:00:00Z');
    expect(calendarDateInTimeZone(instant, 'America/New_York')).toBe('2026-08-12');
    expect(calendarDateInTimeZone(instant, 'Asia/Jerusalem')).toBe('2026-08-13');
    expect(formatCalendarDate('2026-08-03', { weekday: 'short' })).toBe('Mon');
  });
  it('rejects invalid household timezones', async () => {
    const repository = await signedIn();
    await expect(repository.updateHousehold({ timezone: 'Not/A_Zone' })).rejects.toThrow();
  });
  it('uses household servings and retains only referenced archived choices', async () => {
    const repository = await signedIn();
    await repository.updateHousehold({ defaultServings: 7 });
    const data = await repository.getData();
    const referencedIngredient = data.ingredients.find(
      (ingredient) => ingredient.id === data.recipes[0].ingredients[0].ingredientId,
    )!;
    const unrelatedIngredient = data.ingredients.find(
      (ingredient) =>
        !data.recipes[0].ingredients.some((row) => row.ingredientId === ingredient.id),
    )!;
    referencedIngredient.status = 'archived';
    unrelatedIngredient.status = 'archived';
    data.recipes[0].status = 'archived';
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    render(
      <RepositoryProvider>
        <RecipeForm onSaved={() => undefined} />
      </RepositoryProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText('Servings')).toHaveValue(7));
    expect(screen.queryByText(`${referencedIngredient.name} (archived)`)).not.toBeInTheDocument();
    render(
      <RepositoryProvider>
        <RecipeForm item={data.recipes[0]} onSaved={() => undefined} />
      </RepositoryProvider>,
    );
    expect(
      (await screen.findAllByText(`${referencedIngredient.name} (archived)`)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(`${unrelatedIngredient.name} (archived)`)).not.toBeInTheDocument();
    render(
      <RepositoryProvider>
        <MealForm plan={data.plans[0]} meal={data.plans[0].entries[0]} onSaved={() => undefined} />
      </RepositoryProvider>,
    );
    expect(await screen.findByText(`${data.recipes[0].name} (archived)`)).toBeInTheDocument();
  });
});
describe('invitation states with fake time', () => {
  it('supports pending, accepted/already-used, revoked, and expired states', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2035-01-01T00:00:00Z'));
    const repository = await signedIn();
    const pending = await repository.invite('pending@example.com', 'member');
    const pendingToken = await acceptanceToken(repository, pending.id);
    expect((await repository.inspectInvitation(pendingToken)).status).toBe('pending');
    const session = await repository.acceptInvitation(
      pendingToken,
      'Pending Person',
      'new-password',
    );
    await repository.logout();
    await expect(repository.login('pending@example.com', 'new-password')).resolves.toMatchObject({
      userId: session.userId,
    });
    expect((await repository.inspectInvitation(pendingToken)).status).toBe('accepted');
    await expect(
      repository.acceptInvitation(pendingToken, 'Again', 'new-password'),
    ).rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
    await repository.login('owner@mealplanner.dev', 'mealplanner-demo');
    const revoked = await repository.invite('revoked@example.com', 'member');
    const revokedToken = await acceptanceToken(repository, revoked.id);
    await repository.revokeInvitation(revoked.id);
    expect((await repository.inspectInvitation(revokedToken)).status).toBe('revoked');
    const expired = await repository.invite('expired@example.com', 'member');
    const expiredToken = await acceptanceToken(repository, expired.id);
    vi.advanceTimersByTime(8 * 86400000);
    expect((await repository.inspectInvitation(expiredToken)).status).toBe('expired');
  });
  it('rechecks duplicate membership during acceptance', async () => {
    const repository = await signedIn();
    const invitation = await repository.invite('new@example.com', 'member');
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as typeof seedData;
    data.members.push({ ...data.members[2], id: 'duplicate-member', email: 'new@example.com' });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const token = await acceptanceToken(repository, invitation.id);
    await expect(
      repository.acceptInvitation(token, 'Duplicate', 'new-password'),
    ).rejects.toMatchObject({ code: 'DUPLICATE' });
  });
  it('rejects an invalid public token', async () => {
    const repository = await signedIn();
    await expect(repository.inspectInvitation('not-a-real-token')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      repository.acceptInvitation('not-a-real-token', 'Nobody', 'new-password'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
describe('HTTP repository authentication and validation', () => {
  const user = seedData.members[0];
  const envelope = { accessToken: 'access-token', expiresAt: '2035-01-01T01:00:00.000Z', user };
  it('stores login tokens in memory and attaches bearer auth to protected requests', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope))
      .mockResolvedValueOnce(jsonResponse(seedData));
    const repository = new HttpMealPlannerRepository(
      'https://example.test/api/v1',
      fetcher as typeof fetch,
    );
    await repository.login(user.email, 'password');
    await repository.getData();
    expect(fetcher.mock.calls[1][1]?.headers).toBeInstanceOf(Headers);
    expect((fetcher.mock.calls[1][1]?.headers as Headers).get('Authorization')).toBe(
      'Bearer access-token',
    );
  });
  it('refreshes with the HTTP-only cookie before bootstrap', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope))
      .mockResolvedValueOnce(jsonResponse(seedData));
    const repository = new HttpMealPlannerRepository(
      'https://example.test/api/v1',
      fetcher as typeof fetch,
    );
    await repository.getData();
    expect(fetcher.mock.calls[0][0]).toContain('/auth/refresh');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
    expect((fetcher.mock.calls[1][1]?.headers as Headers).get('Authorization')).toBe(
      'Bearer access-token',
    );
  });
  it('rejects invalid successful responses', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope))
      .mockResolvedValueOnce(jsonResponse({ version: 2 }));
    const repository = new HttpMealPlannerRepository('/api/v1', fetcher as typeof fetch);
    await expect(repository.getData()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('parses structured errors and field details', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid email.',
            details: [{ field: 'email', message: 'Already used.' }],
          },
        },
        422,
      ),
    );
    const repository = new HttpMealPlannerRepository('/api/v1', fetcher as typeof fetch);
    await expect(repository.login('bad@example.com', 'password')).rejects.toEqual(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        status: 422,
        details: [{ field: 'email', message: 'Already used.' }],
      }),
    );
  });
  it('keeps public invitation inspection independent from refresh and bootstrap', async () => {
    const invitation = seedData.invitations[0];
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(invitation));
    const repository = new HttpMealPlannerRepository('/api/v1', fetcher as typeof fetch);
    await expect(repository.inspectInvitation('public-token')).resolves.toEqual(invitation);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/v1/invitations/public-token');
  });
  it('protects acceptance-link reads and establishes a session on acceptance', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope))
      .mockResolvedValueOnce(
        jsonResponse({ acceptanceUrl: 'https://app.test/invite/private-token' }),
      )
      .mockResolvedValueOnce(jsonResponse(envelope));
    const repository = new HttpMealPlannerRepository('/api/v1', fetcher as typeof fetch);
    await repository.login(user.email, 'password');
    await expect(repository.getInvitationAcceptanceUrl('invitation-id')).resolves.toContain(
      '/invite/private-token',
    );
    expect((fetcher.mock.calls[1][1]?.headers as Headers).get('Authorization')).toBe(
      'Bearer access-token',
    );
    await expect(
      repository.acceptInvitation('private-token', 'New Person', 'new-password'),
    ).resolves.toMatchObject({ userId: user.id });
    expect(fetcher.mock.calls[2][1]).toMatchObject({ credentials: 'include', method: 'POST' });
  });
  it('handles 204 responses consistently', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const repository = new HttpMealPlannerRepository('/api/v1', fetcher as typeof fetch);
    await repository.login(user.email, 'password');
    await expect(repository.deleteIngredient('ingredient-id')).resolves.toBeUndefined();
  });
  it('clears an established session after refresh proves a protected request unauthorized', async () => {
    const unauthorized = () =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Expired.', details: [] } }, 401);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(envelope))
      .mockImplementation(unauthorized);
    const repository = new HttpMealPlannerRepository('/api/v1', fetcher as typeof fetch);
    await repository.login(user.email, 'password');
    await expect(repository.getData()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(repository.currentUser()).resolves.toBeNull();
  });
});

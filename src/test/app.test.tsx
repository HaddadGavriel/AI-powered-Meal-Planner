import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appDataSchema } from '@/lib/schemas';
import { HttpMealPlannerRepository, LocalStorageMealPlannerRepository, STORAGE_KEY, } from '@/data/repository';
import { createSeedData, seedData } from '@/data/seed';
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});
async function signedIn(email = 'owner@mealplanner.dev') {
    const repository = new LocalStorageMealPlannerRepository();
    await repository.reset();
    await repository.login(email, 'mealplanner-demo');
    return repository;
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
        expect(seedData.recipes.every((recipe) => recipe.ingredients.every((row) => ingredients.has(row.ingredientId)))).toBe(true);
        expect(seedData.plans.every((plan) => plan.entries.every((entry) => recipes.has(entry.recipeId)))).toBe(true);
    });
    it('creates a usable pending invitation relative to reset time', () => {
        const reference = Date.UTC(2042, 0, 1);
        const invitation = createSeedData(reference).invitations[0];
        expect(invitation.status).toBe('pending');
        expect(Date.parse(invitation.expiresAt)).toBe(reference + 7 * 86400000);
    });
});
describe('local repository integrity and authorization', () => {
    it('recovers corrupt storage without reading it during server rendering', async () => {
        localStorage.setItem(STORAGE_KEY, 'bad json');
        const repository = new LocalStorageMealPlannerRepository();
        expect((await repository.getData()).version).toBe(2);
        expect([...Array(localStorage.length)].some((_, index) => localStorage.key(index)?.includes(':corrupt:'))).toBe(true);
    });
    it('rejects member meal and shopping mutations', async () => {
        const repository = await signedIn('member@mealplanner.dev');
        await expect(repository.upsertMeal('plan-current', {
            date: '2026-08-04', mealType: 'dinner', recipeId: 'rec-pasta', servingCount: 2,
        })).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(repository.removeMeal('plan-current', 'meal-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(repository.clearChecked('list-current')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
    it('rejects moving a plan week around existing entries without changing storage', async () => {
        const repository = await signedIn();
        const before = localStorage.getItem(STORAGE_KEY);
        await expect(repository.updatePlan('plan-current', { weekStartDate: '2026-09-07' }))
            .rejects.toMatchObject({ code: 'ENTRY_OUTSIDE_WEEK' });
        expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    });
    it('rejects invalid shopping values without corrupting or resetting data', async () => {
        const repository = await signedIn();
        const before = localStorage.getItem(STORAGE_KEY);
        const list = (await repository.getData()).shoppingLists[0];
        await expect(repository.updateShoppingList(list.id, {
            items: list.items.map((item, index) => index === 0 ? { ...item, quantity: 0 } : item),
        })).rejects.toThrow();
        expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
        expect((await repository.getData()).shoppingLists[0].items[0].quantity).toBeGreaterThan(0);
    });
    it('enforces references and the only-owner invariant', async () => {
        const repository = await signedIn();
        await expect(repository.deleteIngredient('ing-pasta')).rejects.toMatchObject({ code: 'REFERENCED' });
        await expect(repository.deleteRecipe('rec-pasta')).rejects.toMatchObject({ code: 'REFERENCED' });
        await expect(repository.changeRole('user-owner', 'member')).rejects.toMatchObject({ code: 'ONLY_OWNER' });
        await expect(repository.removeMember('user-owner')).rejects.toMatchObject({ code: 'ONLY_OWNER' });
    });
    it('prevents an administrator from managing an owner', async () => {
        const repository = await signedIn('admin@mealplanner.dev');
        await expect(repository.changeRole('user-owner', 'member')).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(repository.removeMember('user-owner')).rejects.toMatchObject({ code: 'ONLY_OWNER' });
    });
});
describe('invitation states with fake time', () => {
    it('supports pending, accepted/already-used, revoked, and expired states', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2035-01-01T00:00:00Z'));
        const repository = await signedIn();
        const pending = await repository.invite('pending@example.com', 'member');
        expect((await repository.inspectInvitation(pending.token)).status).toBe('pending');
        await repository.acceptInvitation(pending.token, 'Pending Person');
        expect((await repository.inspectInvitation(pending.token)).status).toBe('accepted');
        await expect(repository.acceptInvitation(pending.token, 'Again')).rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
        const revoked = await repository.invite('revoked@example.com', 'member');
        await repository.revokeInvitation(revoked.id);
        expect((await repository.inspectInvitation(revoked.token)).status).toBe('revoked');
        const expired = await repository.invite('expired@example.com', 'member');
        vi.advanceTimersByTime(8 * 86400000);
        expect((await repository.inspectInvitation(expired.token)).status).toBe('expired');
    });
    it('rechecks duplicate membership during acceptance', async () => {
        const repository = await signedIn();
        const invitation = await repository.invite('new@example.com', 'member');
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as typeof seedData;
        data.members.push({ ...data.members[2], id: 'duplicate-member', email: 'new@example.com' });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        await expect(repository.acceptInvitation(invitation.token, 'Duplicate')).rejects.toMatchObject({ code: 'DUPLICATE' });
    });
});
describe('HTTP repository authentication and validation', () => {
    const user = seedData.members[0];
    const envelope = { accessToken: 'access-token', expiresAt: '2035-01-01T01:00:00.000Z', user };
    it('stores login tokens in memory and attaches bearer auth to protected requests', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse(envelope))
            .mockResolvedValueOnce(jsonResponse(seedData));
        const repository = new HttpMealPlannerRepository('https://example.test/api/v1', fetcher as typeof fetch);
        await repository.login(user.email, 'password');
        await repository.getData();
        expect(fetcher.mock.calls[1][1]?.headers).toBeInstanceOf(Headers);
        expect((fetcher.mock.calls[1][1]?.headers as Headers).get('Authorization')).toBe('Bearer access-token');
    });
    it('refreshes with the HTTP-only cookie before bootstrap', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse(envelope))
            .mockResolvedValueOnce(jsonResponse(seedData));
        const repository = new HttpMealPlannerRepository('https://example.test/api/v1', fetcher as typeof fetch);
        await repository.getData();
        expect(fetcher.mock.calls[0][0]).toContain('/auth/refresh');
        expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
        expect((fetcher.mock.calls[1][1]?.headers as Headers).get('Authorization')).toBe('Bearer access-token');
    });
    it('rejects invalid successful responses', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse(envelope))
            .mockResolvedValueOnce(jsonResponse({ version: 2 }));
        const repository = new HttpMealPlannerRepository('/api/v1', fetcher as typeof fetch);
        await expect(repository.getData()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    });
    it('parses structured errors and field details', async () => {
        const fetcher = vi.fn().mockResolvedValue(jsonResponse({
            error: { code: 'VALIDATION_ERROR', message: 'Invalid email.', details: [{ field: 'email', message: 'Already used.' }] },
        }, 422));
        const repository = new HttpMealPlannerRepository('/api/v1', fetcher as typeof fetch);
        await expect(repository.login('bad@example.com', 'password')).rejects.toEqual(expect.objectContaining({
            code: 'VALIDATION_ERROR', status: 422, details: [{ field: 'email', message: 'Already used.' }],
        }));
    });
    it('keeps public invitation inspection independent from refresh and bootstrap', async () => {
        const invitation = seedData.invitations[0];
        const fetcher = vi.fn().mockResolvedValue(jsonResponse(invitation));
        const repository = new HttpMealPlannerRepository('/api/v1', fetcher as typeof fetch);
        await expect(repository.inspectInvitation(invitation.token)).resolves.toEqual(invitation);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher.mock.calls[0][0]).toBe(`/api/v1/invitations/${invitation.token}`);
    });

    it('handles 204 responses consistently', async () => {
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse(envelope))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const repository = new HttpMealPlannerRepository('/api/v1', fetcher as typeof fetch);
        await repository.login(user.email, 'password');
        await expect(repository.deleteIngredient('ingredient-id')).resolves.toBeUndefined();
    });
});

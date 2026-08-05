import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ingredientSchema, recipeSchema, weeklyMealPlanSchema } from '@/lib/schemas';
import { repo } from '@/data/repository';
import { seedData } from '@/data/seed';
import { AppShell } from '@/components/AppShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  localStorage.clear();
  repo.reset();
});

describe('schemas and seed relationships', () => {
  it('validates ingredient recipe and meal plans', () => {
    expect(ingredientSchema.safeParse(seedData.ingredients[0]).success).toBe(true);
    expect(recipeSchema.safeParse(seedData.recipes[0]).success).toBe(true);
    expect(weeklyMealPlanSchema.safeParse(seedData.plans[0]).success).toBe(true);
  });

  it('recipes reference seeded ingredients', () => {
    const ids = new Set(seedData.ingredients.map(i => i.id));
    expect(seedData.recipes.every(r => r.ingredients.every(i => ids.has(i.ingredientId)))).toBe(true);
  });
});

describe('repository', () => {
  it('authenticates the demo user and persists session', () => {
    repo.login(repo.demo.email, repo.demo.password);
    expect(repo.currentUser()?.role).toBe('owner');
    expect(repo.getSession()).not.toBeNull();
  });

  it('persists CRUD and resets seed data', () => {
    repo.saveIngredient({ id: 'ing-test', name: 'Test Mint', category: 'Produce', defaultUnit: 'cups', allergens: [], status: 'active' });
    expect(repo.ingredients().some(i => i.id === 'ing-test')).toBe(true);
    repo.reset();
    expect(repo.ingredients().some(i => i.id === 'ing-test')).toBe(false);
  });

  it('prevents removing or demoting the only owner', () => {
    expect(() => repo.changeRole('user-owner', 'member')).toThrow(/only owner/);
    expect(() => repo.removeMember('user-owner')).toThrow(/only owner/);
  });
});

describe('navigation shell', () => {
  it('shows protected navigation for logged in users', () => {
    repo.login(repo.demo.email, repo.demo.password);
    render(
      <AppShell>
        <h1>Child</h1>
      </AppShell>,
    );
    expect(screen.getByRole('navigation', { name: /main/i })).toBeInTheDocument();
    expect(screen.getByText('Ingredients')).toBeInTheDocument();
  });
});

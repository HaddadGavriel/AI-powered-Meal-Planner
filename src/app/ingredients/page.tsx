'use client';

import { useState } from 'react';

import { AppShell } from '@/components/AppShell';
import { IngredientForm } from '@/components/Forms';
import { Badge, Button, Card, Empty, Field, Select } from '@/components/ui';
import { repo } from '@/data/repository';
import type { Ingredient } from '@/lib/types';

const categories = [
  'All',
  'Produce',
  'Dairy',
  'Grains',
  'Meat and poultry',
  'Seafood',
  'Legumes',
  'Spices',
  'Condiments',
  'Baking',
  'Other',
] as const;

export default function Ingredients() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<(typeof categories)[number]>('All');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const items = repo
    .ingredients()
    .filter(
      (ingredient) =>
        ingredient.name.toLowerCase().includes(query.toLowerCase()) &&
        (category === 'All' || ingredient.category === category),
    );

  function refresh() {
    setRefreshToken((current) => current + 1);
  }

  function deleteIngredient(ingredient: Ingredient) {
    if (window.confirm(`Delete ${ingredient.name}?`)) {
      repo.deleteIngredient(ingredient.id);
      refresh();
    }
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Ingredients</h1>
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Select
            label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value as (typeof categories)[number])}
          >
            {categories.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </Select>
          <Button type="button" onClick={() => setShowCreateForm((current) => !current)}>
            Create ingredient
          </Button>
        </div>
        {showCreateForm ? (
          <div className="mt-4">
            <IngredientForm
              onSaved={() => {
                setShowCreateForm(false);
                refresh();
              }}
            />
          </div>
        ) : null}
      </Card>
      {items.length ? (
        <div className="grid gap-3 md:grid-cols-2" data-refresh-token={refreshToken}>
          {items.map((ingredient) => (
            <Card key={ingredient.id}>
              <h2 className="text-xl font-semibold">{ingredient.name}</h2>
              <p>
                <Badge>{ingredient.category}</Badge> {ingredient.defaultUnit} · {ingredient.status}
              </p>
              <p className="text-sm text-slate-600">{ingredient.notes}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    repo.updateIngredient(ingredient.id, {
                      status: ingredient.status === 'active' ? 'archived' : 'active',
                    });
                    refresh();
                  }}
                >
                  {ingredient.status === 'active' ? 'Archive' : 'Restore'}
                </Button>
                <Button className="bg-red-700" type="button" onClick={() => deleteIngredient(ingredient)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty title="No ingredients" body="Try another filter or create an ingredient." />
      )}
    </AppShell>
  );
}

'use client';

import { useState } from 'react';

import { AppShell } from '@/components/AppShell';
import { RecipeForm } from '@/components/Forms';
import { Badge, Button, Card, Empty, Field } from '@/components/ui';
import { repo } from '@/data/repository';
import type { Recipe } from '@/lib/types';

export default function Recipes() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [query, setQuery] = useState('');
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const ingredients = repo.ingredients();
  const recipes = repo.recipes().filter((recipe) => recipe.name.toLowerCase().includes(query.toLowerCase()));

  function refresh() {
    setRefreshToken((current) => current + 1);
  }

  function deleteRecipe(recipe: Recipe) {
    if (window.confirm(`Delete ${recipe.name}?`)) {
      repo.deleteRecipe(recipe.id);
      refresh();
    }
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Recipes</h1>
      <Card>
        <div className="flex flex-wrap gap-3">
          <Field label="Search recipes" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Button type="button" onClick={() => setShowCreateForm((current) => !current)}>
            Create recipe
          </Button>
        </div>
        {showCreateForm ? (
          <RecipeForm
            onSaved={() => {
              setShowCreateForm(false);
              refresh();
            }}
          />
        ) : null}
      </Card>
      {recipes.length ? (
        <div className="grid gap-4 lg:grid-cols-2" data-refresh-token={refreshToken}>
          {recipes.map((recipe) => (
            <Card key={recipe.id}>
              <h2 className="text-xl font-semibold">{recipe.name}</h2>
              <p className="text-slate-600">{recipe.description}</p>
              <p>
                <Badge>{recipe.cuisine}</Badge> {recipe.prepTimeMinutes + recipe.cookTimeMinutes} min ·{' '}
                {recipe.servings} servings · {recipe.status}
              </p>
              <h3 className="mt-3 font-semibold">Ingredients</h3>
              <ul className="list-disc pl-5 text-sm">
                {recipe.ingredients.map((recipeIngredient, index) => (
                  <li key={`${recipeIngredient.ingredientId}-${index}`}>
                    {recipeIngredient.quantity} {recipeIngredient.unit}{' '}
                    {ingredients.find((ingredient) => ingredient.id === recipeIngredient.ingredientId)?.name}{' '}
                    {recipeIngredient.preparationNote}
                  </li>
                ))}
              </ul>
              <h3 className="mt-3 font-semibold">Steps</h3>
              <ol className="list-decimal pl-5 text-sm">
                {recipe.instructions.map((step, index) => (
                  <li key={`${index}-${step}`}>{step}</li>
                ))}
              </ol>
              {editingRecipeId === recipe.id ? (
                <div className="mt-4">
                  <RecipeForm
                    item={recipe}
                    onSaved={() => {
                      setEditingRecipeId(null);
                      refresh();
                    }}
                  />
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  onClick={() => setEditingRecipeId(editingRecipeId === recipe.id ? null : recipe.id)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    repo.updateRecipe(recipe.id, {
                      status: recipe.status === 'active' ? 'archived' : 'active',
                    });
                    refresh();
                  }}
                >
                  {recipe.status === 'active' ? 'Archive' : 'Restore'}
                </Button>
                <Button className="bg-red-700" type="button" onClick={() => deleteRecipe(recipe)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty title="No recipes" body="Create a structured recipe with ingredient rows and steps." />
      )}
    </AppShell>
  );
}

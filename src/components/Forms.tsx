'use client';

import { useState } from 'react';

import { repo } from '@/data/repository';
import type { Ingredient, MealType, PlanStatus, Recipe, Status, WeeklyMealPlan } from '@/lib/types';
import { Button, Field, Select } from './ui';

export function IngredientForm({ item, onSaved }: { item?: Ingredient; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<Ingredient['category']>(item?.category ?? 'Produce');

  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const payload = {
          id: item?.id ?? `ing-${name.toLowerCase().replaceAll(' ', '-')}`,
          name,
          category,
          defaultUnit: item?.defaultUnit ?? 'pieces',
          allergens: item?.allergens ?? [],
          notes: item?.notes ?? '',
          status: item?.status ?? ('active' as Status),
        };

        if (item) {
          repo.updateIngredient(item.id, payload);
        } else {
          repo.saveIngredient(payload);
        }
        onSaved();
      }}
    >
      <Field required label="Name" value={name} onChange={(event) => setName(event.target.value)} />
      <Select
        label="Category"
        value={category}
        onChange={(event) => setCategory(event.target.value as Ingredient['category'])}
      >
        {[
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
        ].map((option) => (
          <option key={option}>{option}</option>
        ))}
      </Select>
      <Button>Save ingredient</Button>
    </form>
  );
}

export function RecipeForm({ item, onSaved }: { item?: Recipe; onSaved: () => void }) {
  const ingredients = repo.ingredients();
  const [name, setName] = useState(item?.name ?? '');
  const [recipeIngredients, setRecipeIngredients] = useState(
    item?.ingredients ?? [
      {
        ingredientId: ingredients[0]?.id ?? '',
        quantity: 1,
        unit: 'pieces',
        preparationNote: '',
      },
    ],
  );
  const [steps, setSteps] = useState(item?.instructions ?? ['Prepare ingredients.']);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const payload = {
          id: item?.id ?? `rec-${name.toLowerCase().replaceAll(' ', '-')}`,
          name,
          description: item?.description ?? 'A household favorite recipe for the weekly plan.',
          prepTimeMinutes: item?.prepTimeMinutes ?? 10,
          cookTimeMinutes: item?.cookTimeMinutes ?? 20,
          servings: item?.servings ?? 4,
          difficulty: item?.difficulty ?? 'easy',
          cuisine: item?.cuisine ?? 'Home',
          mealTypes: item?.mealTypes ?? (['dinner'] as MealType[]),
          tags: item?.tags ?? ['family'],
          instructions: steps,
          ingredients: recipeIngredients,
          imageUrl: '',
          status: item?.status ?? ('active' as Status),
        };

        if (item) {
          repo.updateRecipe(item.id, payload);
        } else {
          repo.saveRecipe(payload);
        }
        onSaved();
      }}
    >
      <Field required label="Recipe name" value={name} onChange={(event) => setName(event.target.value)} />
      <h3 className="font-semibold">Structured ingredients</h3>
      {recipeIngredients.map((row, index) => (
        <div className="grid gap-2 md:grid-cols-4" key={`${row.ingredientId}-${index}`}>
          <select
            aria-label="Ingredient"
            className="rounded border p-2"
            value={row.ingredientId}
            onChange={(event) =>
              setRecipeIngredients(
                recipeIngredients.map((ingredient, ingredientIndex) =>
                  ingredientIndex === index ? { ...ingredient, ingredientId: event.target.value } : ingredient,
                ),
              )
            }
          >
            {ingredients.map((ingredient) => (
              <option key={ingredient.id} value={ingredient.id}>
                {ingredient.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Quantity"
            className="rounded border p-2"
            type="number"
            value={row.quantity}
            onChange={(event) =>
              setRecipeIngredients(
                recipeIngredients.map((ingredient, ingredientIndex) =>
                  ingredientIndex === index ? { ...ingredient, quantity: Number(event.target.value) } : ingredient,
                ),
              )
            }
          />
          <input
            aria-label="Unit"
            className="rounded border p-2"
            value={row.unit}
            onChange={(event) =>
              setRecipeIngredients(
                recipeIngredients.map((ingredient, ingredientIndex) =>
                  ingredientIndex === index ? { ...ingredient, unit: event.target.value } : ingredient,
                ),
              )
            }
          />
          <input
            aria-label="Preparation note"
            className="rounded border p-2"
            value={row.preparationNote}
            onChange={(event) =>
              setRecipeIngredients(
                recipeIngredients.map((ingredient, ingredientIndex) =>
                  ingredientIndex === index
                    ? { ...ingredient, preparationNote: event.target.value }
                    : ingredient,
                ),
              )
            }
          />
        </div>
      ))}
      <Button
        type="button"
        onClick={() =>
          setRecipeIngredients([
            ...recipeIngredients,
            {
              ingredientId: ingredients[0].id,
              quantity: 1,
              unit: ingredients[0].defaultUnit,
              preparationNote: '',
            },
          ])
        }
      >
        Add ingredient row
      </Button>
      <h3 className="font-semibold">Ordered steps</h3>
      {steps.map((step, index) => (
        <Field
          key={`${index}-${step}`}
          label={`Step ${index + 1}`}
          value={step}
          onChange={(event) =>
            setSteps(steps.map((currentStep, stepIndex) => (stepIndex === index ? event.target.value : currentStep)))
          }
        />
      ))}
      <Button type="button" onClick={() => setSteps([...steps, ''])}>
        Add step
      </Button>{' '}
      <Button>Save recipe</Button>
    </form>
  );
}

export function PlanForm({ item, onSaved }: { item?: WeeklyMealPlan; onSaved: () => void }) {
  const recipes = repo.recipes();
  const [name, setName] = useState(item?.name ?? 'New weekly plan');
  const [date, setDate] = useState(item?.weekStartDate ?? '2026-08-10');

  return (
    <form
      className="grid gap-3 md:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        const payload = {
          id: item?.id ?? `plan-${date}`,
          householdId: 'hh-green-table',
          name,
          weekStartDate: date,
          status: item?.status ?? ('draft' as PlanStatus),
          notes: item?.notes ?? '',
          entries:
            item?.entries ??
            [{ id: `meal-${date}-dinner`, date, mealType: 'dinner' as MealType, recipeId: recipes[0].id, servingCount: 4 }],
        };

        if (item) {
          repo.updatePlan(item.id, payload);
        } else {
          repo.savePlan(payload);
        }
        onSaved();
      }}
    >
      <Field label="Plan name" value={name} onChange={(event) => setName(event.target.value)} />
      <Field label="Week start" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <Button>Save plan</Button>
    </form>
  );
}

'use client';
import { useState } from 'react';
import { useMealPlanner } from '@/data/RepositoryProvider';
import type { Ingredient, Recipe, WeeklyMealPlan, MealEntry } from '@/lib/types';
import { Button, Field, Select } from './ui';
const split = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const input =
  'min-h-10 w-full rounded-xl border border-[rgb(var(--input))] bg-[rgb(var(--surface-raised))] px-3 py-2 text-sm';
export function IngredientForm({ item, onSaved }: { item?: Ingredient; onSaved(): void }) {
  const { repo, run } = useMealPlanner(),
    [v, setV] = useState({
      name: item?.name ?? '',
      category: item?.category ?? 'Produce',
      defaultUnit: item?.defaultUnit ?? '',
      allergens: item?.allergens.join(', ') ?? '',
      notes: item?.notes ?? '',
      status: item?.status ?? 'active',
    });
  const set = (k: string, x: string) => setV({ ...v, [k]: x });
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const payload = {
          ...v,
          category: v.category as Ingredient['category'],
          status: v.status as Ingredient['status'],
          allergens: split(v.allergens),
        };
        const result = await run(
          () => (item ? repo.updateIngredient(item.id, payload) : repo.createIngredient(payload)),
          `Ingredient ${item ? 'updated' : 'created'}.`,
        );
        if (result) onSaved();
      }}
    >
      <Field required label="Name" value={v.name} onChange={(e) => set('name', e.target.value)} />
      <Select label="Category" value={v.category} onChange={(e) => set('category', e.target.value)}>
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
        ].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </Select>
      <Field
        required
        label="Default unit"
        value={v.defaultUnit}
        onChange={(e) => set('defaultUnit', e.target.value)}
      />
      <Field
        label="Allergens (comma separated)"
        value={v.allergens}
        onChange={(e) => set('allergens', e.target.value)}
      />
      <Field label="Notes" value={v.notes} onChange={(e) => set('notes', e.target.value)} />
      <Select label="Status" value={v.status} onChange={(e) => set('status', e.target.value)}>
        <option>active</option>
        <option>archived</option>
      </Select>
      <Button>Save ingredient</Button>
    </form>
  );
}
export function RecipeForm({ item, onSaved }: { item?: Recipe; onSaved(): void }) {
  const { data, repo, run } = useMealPlanner();
  const ings = data?.ingredients.filter((x) => x.status === 'active') ?? [];
  const [v, setV] = useState({
    name: item?.name ?? '',
    description: item?.description ?? '',
    prep: item?.prepTimeMinutes ?? 10,
    cook: item?.cookTimeMinutes ?? 20,
    servings: item?.servings ?? 4,
    difficulty: item?.difficulty ?? 'easy',
    cuisine: item?.cuisine ?? '',
    mealTypes: item?.mealTypes.join(', ') ?? 'dinner',
    tags: item?.tags.join(', ') ?? '',
    status: item?.status ?? 'active',
    imageUrl: item?.imageUrl ?? '',
  });
  const [rows, setRows] = useState(
    item?.ingredients ??
      (ings[0]
        ? [
            {
              ingredientId: ings[0].id,
              quantity: 1,
              unit: ings[0].defaultUnit,
              preparationNote: '',
            },
          ]
        : []),
  );
  const [steps, setSteps] = useState(item?.instructions ?? ['']);
  const field = (k: string, x: string | number) => setV({ ...v, [k]: x });
  if (!ings.length)
    return <p>No active ingredients exist. Create an ingredient before creating a recipe.</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const payload = {
          name: v.name,
          description: v.description,
          prepTimeMinutes: Number(v.prep),
          cookTimeMinutes: Number(v.cook),
          servings: Number(v.servings),
          difficulty: v.difficulty as Recipe['difficulty'],
          cuisine: v.cuisine,
          mealTypes: split(v.mealTypes) as Recipe['mealTypes'],
          tags: split(v.tags),
          status: v.status as Recipe['status'],
          imageUrl: v.imageUrl,
          ingredients: rows,
          instructions: steps,
        };
        const result = await run(
          () => (item ? repo.updateRecipe(item.id, payload) : repo.createRecipe(payload)),
          `Recipe ${item ? 'updated' : 'created'}.`,
        );
        if (result) onSaved();
      }}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Field
          required
          label="Name"
          value={v.name}
          onChange={(e) => field('name', e.target.value)}
        />
        <Field
          required
          label="Description"
          value={v.description}
          onChange={(e) => field('description', e.target.value)}
        />
        <Field
          required
          label="Cuisine"
          value={v.cuisine}
          onChange={(e) => field('cuisine', e.target.value)}
        />
        <Field
          label="Prep minutes"
          type="number"
          min="0"
          value={v.prep}
          onChange={(e) => field('prep', e.target.value)}
        />
        <Field
          label="Cook minutes"
          type="number"
          min="0"
          value={v.cook}
          onChange={(e) => field('cook', e.target.value)}
        />
        <Field
          label="Servings"
          type="number"
          min="1"
          value={v.servings}
          onChange={(e) => field('servings', e.target.value)}
        />
        <Select
          label="Difficulty"
          value={v.difficulty}
          onChange={(e) => field('difficulty', e.target.value)}
        >
          <option>easy</option>
          <option>medium</option>
          <option>hard</option>
        </Select>
        <Field
          label="Meal types (comma separated)"
          value={v.mealTypes}
          onChange={(e) => field('mealTypes', e.target.value)}
        />
        <Field label="Tags" value={v.tags} onChange={(e) => field('tags', e.target.value)} />
        <Field
          label="Optional image URL"
          value={v.imageUrl}
          onChange={(e) => field('imageUrl', e.target.value)}
        />
      </div>
      <h3 className="font-semibold">Ingredient rows</h3>
      {rows.map((row, i) => (
        <div className="grid gap-2 md:grid-cols-5" key={i}>
          <select
            aria-label={`Ingredient ${i + 1}`}
            className={input}
            value={row.ingredientId}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, ingredientId: e.target.value } : x)))
            }
          >
            {ings.map((x) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <input
            aria-label={`Quantity ${i + 1}`}
            className={input}
            type="number"
            min="0.01"
            step="any"
            value={row.quantity}
            onChange={(e) =>
              setRows(
                rows.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)),
              )
            }
          />
          <input
            aria-label={`Unit ${i + 1}`}
            className={input}
            value={row.unit}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))
            }
          />
          <input
            aria-label={`Preparation ${i + 1}`}
            className={input}
            value={row.preparationNote ?? ''}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, preparationNote: e.target.value } : x)))
            }
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          setRows([
            ...rows,
            {
              ingredientId: ings[0].id,
              quantity: 1,
              unit: ings[0].defaultUnit,
              preparationNote: '',
            },
          ])
        }
      >
        Add ingredient row
      </Button>
      <h3 className="font-semibold">Ordered instructions</h3>
      {steps.map((step, i) => (
        <div className="flex gap-2" key={i}>
          <Field
            className="flex-1"
            label={`Step ${i + 1}`}
            value={step}
            onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={i === 0}
            onClick={() => {
              const n = [...steps];
              [n[i - 1], n[i]] = [n[i], n[i - 1]];
              setSteps(n);
            }}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSteps(steps.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => setSteps([...steps, ''])}>
        Add step
      </Button>{' '}
      <Button>Save recipe</Button>
    </form>
  );
}
export function PlanForm({ item, onSaved }: { item?: WeeklyMealPlan; onSaved(): void }) {
  const { data, repo, run } = useMealPlanner(),
    [name, setName] = useState(item?.name ?? ''),
    [date, setDate] = useState(item?.weekStartDate ?? new Date().toISOString().slice(0, 10)),
    [status, setStatus] = useState(item?.status ?? 'draft'),
    [notes, setNotes] = useState(item?.notes ?? '');
  return (
    <form
      className="grid gap-3 md:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const payload = {
          householdId: data!.household.id,
          name,
          weekStartDate: date,
          status,
          notes,
          entries: item?.entries ?? [],
        } as Omit<WeeklyMealPlan, 'id' | 'createdAt' | 'updatedAt'>;
        const result = await run(
          () => (item ? repo.updatePlan(item.id, payload) : repo.createPlan(payload)),
          `Plan ${item ? 'updated' : 'created'}.`,
        );
        if (result) onSaved();
      }}
    >
      <Field label="Plan name" required value={name} onChange={(e) => setName(e.target.value)} />
      <Field
        label="Week start"
        type="date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <Select
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value as WeeklyMealPlan['status'])}
      >
        {['draft', 'active', 'completed', 'archived'].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </Select>
      <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button>Save plan</Button>
    </form>
  );
}
export function MealForm({
  plan,
  meal,
  onSaved,
}: {
  plan: WeeklyMealPlan;
  meal?: MealEntry;
  onSaved(): void;
}) {
  const { data, repo, run } = useMealPlanner(),
    recipes = data?.recipes.filter((x) => x.status === 'active') ?? [],
    [date, setDate] = useState(meal?.date ?? plan.weekStartDate),
    [type, setType] = useState(meal?.mealType ?? 'dinner'),
    [recipeId, setRecipe] = useState(meal?.recipeId ?? recipes[0]?.id ?? ''),
    [servings, setServings] = useState(meal?.servingCount ?? data?.household.defaultServings ?? 4),
    [notes, setNotes] = useState(meal?.notes ?? '');
  if (!recipes.length) return <p>Create an active recipe before adding meals.</p>;
  return (
    <form
      className="grid gap-2 md:grid-cols-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await run(
          () =>
            repo.upsertMeal(plan.id, {
              id: meal?.id,
              date,
              mealType: type,
              recipeId,
              servingCount: Number(servings),
              notes,
            }),
          'Meal saved.',
        );
        if (result) onSaved();
      }}
    >
      <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Select
        label="Meal type"
        value={type}
        onChange={(e) => setType(e.target.value as MealEntry['mealType'])}
      >
        {['breakfast', 'lunch', 'dinner', 'snack'].map((x) => (
          <option key={x}>{x}</option>
        ))}
      </Select>
      <Select label="Recipe" value={recipeId} onChange={(e) => setRecipe(e.target.value)}>
        {recipes.map((x) => (
          <option value={x.id} key={x.id}>
            {x.name}
          </option>
        ))}
      </Select>
      <Field
        label="Servings"
        type="number"
        min="1"
        value={servings}
        onChange={(e) => setServings(Number(e.target.value))}
      />
      <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <Button className="self-end">Save meal</Button>
    </form>
  );
}

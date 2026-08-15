'use client';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { RecipeForm } from '@/components/Forms';
import { Badge, Button, Card, Empty, Field } from '@/components/ui';
import { useMealPlanner } from '@/data/RepositoryProvider';
export default function Recipes() {
  const { data, user, repo, run } = useMealPlanner(),
    [q, setQ] = useState(''),
    [show, setShow] = useState(false),
    [edit, setEdit] = useState<string | null>(null);
  if (!data) return <AppShell>{null}</AppShell>;
  const can = user?.role !== 'member',
    recipes = data.recipes.filter((x) => x.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Recipes</h1>
      <Card>
        <div className="flex gap-3">
          <Field label="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} />
          {can && (
            <Button className="self-end" onClick={() => setShow(!show)}>
              Create recipe
            </Button>
          )}
        </div>
        {show && <RecipeForm onSaved={() => setShow(false)} />}
      </Card>
      {recipes.length ? (
        recipes.map((r) => (
          <Card key={r.id}>
            <h2 className="text-xl font-semibold">{r.name}</h2>
            <p>{r.description}</p>
            <Badge>{r.status}</Badge>{' '}
            <span>
              {r.cuisine} · {r.servings} servings
            </span>
            <ul className="mt-2 list-disc pl-5">
              {r.ingredients.map((x, i) => (
                <li key={i}>
                  {x.quantity} {x.unit}{' '}
                  {data.ingredients.find((y) => y.id === x.ingredientId)?.name ??
                    'Missing ingredient'}
                </li>
              ))}
            </ul>
            <ol className="mt-2 list-decimal pl-5">
              {r.instructions.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ol>
            {edit === r.id && <RecipeForm item={r} onSaved={() => setEdit(null)} />}{' '}
            {can && (
              <div className="mt-3 flex gap-2">
                <Button onClick={() => setEdit(edit === r.id ? null : r.id)}>Edit</Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    run(
                      () =>
                        repo.updateRecipe(r.id, {
                          status: r.status === 'active' ? 'archived' : 'active',
                        }),
                      'Recipe status updated.',
                    )
                  }
                >
                  {r.status === 'active' ? 'Archive' : 'Restore'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm(`Delete ${r.name}?`))
                      void run(() => repo.deleteRecipe(r.id), 'Recipe deleted.');
                  }}
                >
                  Delete
                </Button>
              </div>
            )}
          </Card>
        ))
      ) : (
        <Empty title="No recipes" body="Create ingredients, then build a complete recipe." />
      )}
    </AppShell>
  );
}

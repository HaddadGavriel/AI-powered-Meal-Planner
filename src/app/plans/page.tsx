'use client';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { MealForm, PlanForm } from '@/components/Forms';
import { Badge, Button, Card, Empty } from '@/components/ui';
import { useMealPlanner } from '@/data/RepositoryProvider';
import type { WeeklyMealPlan } from '@/lib/types';
const weekdayFormatter = new Intl.DateTimeFormat('en', { weekday: 'short' });
const dateFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });
function planDates(plan: WeeklyMealPlan) {
  const start = new Date(`${plan.weekStartDate}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return {
      label: dateFormatter.format(date),
      weekday: weekdayFormatter.format(date),
      value: date.toISOString().slice(0, 10),
    };
  });
}
export default function Plans() {
  const { data, user, repo, run } = useMealPlanner();
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<string | null>(null);
  const [meal, setMeal] = useState<string | null>(null);
  const [editMeal, setEditMeal] = useState<string | null>(null);
  if (!data) return null;
  const canManage = user?.role !== 'member';
  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Weekly meal plans</h1>
          <p className="mt-1 text-sm text-[rgb(var(--muted))]">
            Review each week in a seven-day grid and manage meals without losing context.
          </p>
        </div>
        {canManage && <Button onClick={() => setCreate(!create)}>Create plan</Button>}
      </div>

      {create && (
        <Card>
          <PlanForm onSaved={() => setCreate(false)} />
        </Card>
      )}

      {data.plans.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {data.plans.map((plan) => (
            <Card key={plan.id} className="min-w-0" data-testid={`plan-${plan.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  <p className="text-sm text-[rgb(var(--muted))]">Week of {plan.weekStartDate}</p>
                </div>
                <Badge>{plan.status}</Badge>
              </div>

              {plan.notes && <p className="mt-3 text-sm">{plan.notes}</p>}

              {edit === plan.id && (
                <div className="mt-4 border-t border-[rgb(var(--border))] pt-4">
                  <PlanForm item={plan} onSaved={() => setEdit(null)} />
                </div>
              )}

              <div
                className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4"
                aria-label={`${plan.name} weekly grid`}
              >
                {planDates(plan).map((day) => {
                  const entries = plan.entries.filter((entry) => entry.date === day.value);
                  return (
                    <section
                      key={day.value}
                      className="min-h-32 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-raised))] p-3"
                    >
                      <h3 className="font-semibold">
                        {day.weekday}{' '}
                        <span className="text-xs font-normal text-[rgb(var(--muted))]">
                          {day.label}
                        </span>
                      </h3>
                      <div className="mt-2 space-y-2">
                        {entries.length ? (
                          entries.map((entry) => (
                            <article
                              key={entry.id}
                              className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-2 text-sm"
                            >
                              <p className="font-semibold capitalize">{entry.mealType}</p>
                              <p>
                                {data.recipes.find((recipe) => recipe.id === entry.recipeId)
                                  ?.name ?? 'Unavailable recipe'}
                              </p>
                              <p className="text-xs text-[rgb(var(--muted))]">
                                {entry.servingCount} servings
                              </p>
                              {canManage && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  <Button
                                    className="min-h-8 px-2 py-1 text-xs"
                                    variant="secondary"
                                    onClick={() =>
                                      setEditMeal(editMeal === entry.id ? null : entry.id)
                                    }
                                  >
                                    Edit or move
                                  </Button>
                                  <Button
                                    className="min-h-8 px-2 py-1 text-xs"
                                    variant="destructive"
                                    onClick={() =>
                                      run(() => repo.removeMeal(plan.id, entry.id), 'Meal removed.')
                                    }
                                  >
                                    Remove
                                  </Button>
                                </div>
                              )}
                              {editMeal === entry.id && (
                                <div className="mt-3 border-t border-[rgb(var(--border))] pt-3 sm:col-span-2">
                                  <MealForm
                                    plan={plan}
                                    meal={entry}
                                    onSaved={() => setEditMeal(null)}
                                  />
                                </div>
                              )}
                            </article>
                          ))
                        ) : (
                          <p className="text-xs text-[rgb(var(--muted))]">No meals</p>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>

              {meal === plan.id && (
                <div className="mt-4 border-t border-[rgb(var(--border))] pt-4">
                  <MealForm plan={plan} onSaved={() => setMeal(null)} />
                </div>
              )}

              {canManage && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => setMeal(meal === plan.id ? null : plan.id)}>
                    Add meal
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setEdit(edit === plan.id ? null : plan.id)}
                  >
                    Edit plan
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      run(
                        () =>
                          repo.updatePlan(plan.id, {
                            status: plan.status === 'archived' ? 'draft' : 'archived',
                          }),
                        'Plan status updated.',
                      )
                    }
                  >
                    {plan.status === 'archived' ? 'Restore' : 'Archive'}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm(`Delete ${plan.name} and its shopping list?`))
                        void run(() => repo.deletePlan(plan.id), 'Plan deleted.');
                    }}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Empty
          title="No plans"
          body="Create a weekly plan. Empty plans and recipe libraries are supported."
        />
      )}
    </AppShell>
  );
}

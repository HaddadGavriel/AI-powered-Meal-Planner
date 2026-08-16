'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { MealForm, PlanForm } from '@/components/Forms';
import { Badge, Button, Card, Empty, PageHeader } from '@/components/ui';
import { useMealPlanner } from '@/data/RepositoryProvider';
import type { MealEntry, WeeklyMealPlan } from '@/lib/types';
import { formatCalendarDate } from '@/lib/calendar';

function planDates(plan: WeeklyMealPlan) {
  const start = new Date(`${plan.weekStartDate}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const value = date.toISOString().slice(0, 10);
    return {
      label: formatCalendarDate(value, { month: 'short', day: 'numeric' }),
      weekday: formatCalendarDate(value, { weekday: 'long' }),
      value,
    };
  });
}

function weekRange(plan: WeeklyMealPlan) {
  const days = planDates(plan);
  return `${formatCalendarDate(days[0].value, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })} – ${formatCalendarDate(days[6].value, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

type MealEditor = { mode: 'add'; date: string } | { mode: 'edit'; meal: MealEntry };

export default function Plans() {
  const { data, user, repo, run } = useMealPlanner();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invalidOpen, setInvalidOpen] = useState(false);
  const [create, setCreate] = useState(false);
  const [editingPlan, setEditingPlan] = useState(false);
  const [mealEditor, setMealEditor] = useState<MealEditor | null>(null);

  useEffect(() => {
    if (!data?.plans.length) return;
    const requested = new URLSearchParams(window.location.search).get('open');
    if (requested && data.plans.some((plan) => plan.id === requested)) {
      setSelectedId(requested);
      setInvalidOpen(false);
    } else {
      setSelectedId((current) =>
        current && data.plans.some((plan) => plan.id === current) ? current : data.plans[0].id,
      );
      setInvalidOpen(Boolean(requested));
    }
  }, [data?.plans]);

  const selectedPlan = useMemo(
    () => data?.plans.find((plan) => plan.id === selectedId) ?? data?.plans[0],
    [data?.plans, selectedId],
  );

  if (!data) return <AppShell>{null}</AppShell>;
  const canManage = user?.role !== 'member';
  const currentPlans = data.plans.filter(
    (plan) => plan.status !== 'archived' && plan.status !== 'completed',
  );
  const historyPlans = data.plans.filter(
    (plan) => plan.status === 'archived' || plan.status === 'completed',
  );
  const choosePlan = (id: string) => {
    setSelectedId(id);
    setEditingPlan(false);
    setMealEditor(null);
    setInvalidOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.set('open', id);
    window.history.replaceState({}, '', url);
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Weekly planning"
        title="Meal plans"
        description="Choose a week, then plan meals in a spacious day-by-day workspace."
        action={
          canManage ? (
            <Button onClick={() => setCreate((value) => !value)}>
              {create ? 'Close create form' : 'Create plan'}
            </Button>
          ) : undefined
        }
      />

      {create && (
        <Card aria-labelledby="create-plan-heading">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 id="create-plan-heading" className="text-xl font-semibold">
                Create a meal plan
              </h2>
              <p className="mt-1 text-sm text-[rgb(var(--muted))]">
                Name the week and set its starting date, status, and notes.
              </p>
            </div>
            <Button variant="ghost" onClick={() => setCreate(false)}>
              Cancel
            </Button>
          </div>
          <PlanForm onSaved={() => setCreate(false)} />
        </Card>
      )}

      {invalidOpen && (
        <p
          role="status"
          className="rounded-xl bg-amber-100 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          That meal plan could not be found. Showing an available plan instead.
        </p>
      )}

      {data.plans.length ? (
        <>
          <nav aria-label="Choose a meal plan" className="space-y-3">
            <PlanPicker
              heading="Current and draft"
              plans={currentPlans}
              selectedId={selectedPlan?.id}
              onSelect={choosePlan}
            />
            <PlanPicker
              heading="Completed and archived"
              plans={historyPlans}
              selectedId={selectedPlan?.id}
              onSelect={choosePlan}
            />
          </nav>

          {selectedPlan && (
            <Card className="min-w-0 overflow-hidden p-0" data-testid={`plan-${selectedPlan.id}`}>
              <header className="border-b border-[rgb(var(--border))] p-5 md:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="break-words text-2xl font-bold md:text-3xl">
                        {selectedPlan.name}
                      </h2>
                      <Badge tone={selectedPlan.status === 'active' ? 'success' : 'neutral'}>
                        {selectedPlan.status}
                      </Badge>
                    </div>
                    <p className="mt-2 font-medium text-[rgb(var(--muted))]">
                      {weekRange(selectedPlan)}
                    </p>
                    {selectedPlan.notes ? (
                      <p className="mt-4 max-w-3xl whitespace-pre-wrap break-words text-sm leading-6">
                        {selectedPlan.notes}
                      </p>
                    ) : (
                      <p className="mt-4 text-sm italic text-[rgb(var(--muted))]">No plan notes.</p>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button
                        onClick={() => {
                          setMealEditor({ mode: 'add', date: selectedPlan.weekStartDate });
                          setEditingPlan(false);
                        }}
                      >
                        Add meal
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditingPlan((value) => !value);
                          setMealEditor(null);
                        }}
                      >
                        Edit plan
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          run(
                            () =>
                              repo.updatePlan(selectedPlan.id, {
                                status: selectedPlan.status === 'archived' ? 'draft' : 'archived',
                              }),
                            'Plan status updated.',
                          )
                        }
                      >
                        {selectedPlan.status === 'archived' ? 'Restore plan' : 'Archive plan'}
                      </Button>
                      <span className="mx-1 hidden h-8 w-px bg-[rgb(var(--border))] sm:block" />
                      <Button
                        variant="destructive"
                        onClick={async () => {
                          if (!window.confirm(`Delete ${selectedPlan.name} and its shopping list?`))
                            return;
                          await run(() => repo.deletePlan(selectedPlan.id), 'Plan deleted.');
                          setMealEditor(null);
                          setEditingPlan(false);
                        }}
                      >
                        Delete plan
                      </Button>
                    </div>
                  )}
                </div>
              </header>

              {editingPlan && (
                <EditorPanel title="Edit plan" onClose={() => setEditingPlan(false)}>
                  <PlanForm item={selectedPlan} onSaved={() => setEditingPlan(false)} />
                </EditorPanel>
              )}

              <div className="p-4 md:p-6">
                <div
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-7"
                  aria-label={`${selectedPlan.name} weekly calendar`}
                >
                  {planDates(selectedPlan).map((day) => {
                    const entries = selectedPlan.entries.filter(
                      (entry) => entry.date === day.value,
                    );
                    return (
                      <section
                        key={day.value}
                        className="flex min-h-44 min-w-0 flex-col rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--surface-raised))] p-3"
                        aria-labelledby={`day-${day.value}`}
                      >
                        <div className="flex items-start justify-between gap-2 xl:block">
                          <h3 id={`day-${day.value}`} className="font-semibold">
                            <span className="block">{day.weekday}</span>
                            <span className="text-xs font-normal text-[rgb(var(--muted))]">
                              {day.label}
                            </span>
                          </h3>
                          {canManage && (
                            <button
                              className="rounded-lg px-2 py-1 text-xs font-semibold text-[rgb(var(--primary))] underline-offset-4 hover:underline xl:mt-2"
                              onClick={() => {
                                setMealEditor({ mode: 'add', date: day.value });
                                setEditingPlan(false);
                              }}
                              aria-label={`Add meal on ${day.weekday}, ${day.label}`}
                            >
                              + Add meal
                            </button>
                          )}
                        </div>
                        <div className="mt-3 space-y-2">
                          {entries.length ? (
                            entries.map((entry) => {
                              const recipe = data.recipes.find(
                                (candidate) => candidate.id === entry.recipeId,
                              );
                              return (
                                <article
                                  key={entry.id}
                                  className="rounded-lg border border-[rgb(var(--border))] bg-[rgb(var(--surface))] p-3 text-sm shadow-sm"
                                >
                                  <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--primary))]">
                                    {entry.mealType}
                                  </p>
                                  <p className="mt-1 break-words font-semibold leading-5">
                                    {recipe?.name ?? 'Unavailable recipe'}
                                  </p>
                                  <p className="mt-1 text-xs text-[rgb(var(--muted))]">
                                    {entry.servingCount} servings
                                    {recipe?.status === 'archived' ? ' · Archived recipe' : ''}
                                  </p>
                                  {entry.notes && (
                                    <p className="mt-2 break-words text-xs leading-5 text-[rgb(var(--muted))]">
                                      {entry.notes}
                                    </p>
                                  )}
                                  {canManage && (
                                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[rgb(var(--border))] pt-2">
                                      <button
                                        className="text-xs font-semibold text-[rgb(var(--primary))] underline-offset-4 hover:underline"
                                        onClick={() => {
                                          setMealEditor({ mode: 'edit', meal: entry });
                                          setEditingPlan(false);
                                        }}
                                        aria-label={`Edit or move ${recipe?.name ?? 'meal'}`}
                                      >
                                        Edit or move
                                      </button>
                                      <button
                                        className="text-xs font-semibold text-[rgb(var(--destructive))] underline-offset-4 hover:underline"
                                        onClick={() =>
                                          run(
                                            () => repo.removeMeal(selectedPlan.id, entry.id),
                                            'Meal removed.',
                                          )
                                        }
                                        aria-label={`Remove ${recipe?.name ?? 'meal'}`}
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  )}
                                </article>
                              );
                            })
                          ) : (
                            <div className="rounded-lg border border-dashed border-[rgb(var(--border))] px-3 py-5 text-center text-xs text-[rgb(var(--muted))]">
                              Nothing planned yet
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>

              {mealEditor && (
                <EditorPanel
                  title={mealEditor.mode === 'add' ? 'Add a meal' : 'Edit or move meal'}
                  description={
                    mealEditor.mode === 'add'
                      ? `Adding to ${formatCalendarDate(mealEditor.date, {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                        })}`
                      : 'Update details or choose another day in this week.'
                  }
                  onClose={() => setMealEditor(null)}
                >
                  <MealForm
                    key={
                      mealEditor.mode === 'add'
                        ? `add-${mealEditor.date}`
                        : `edit-${mealEditor.meal.id}`
                    }
                    plan={selectedPlan}
                    meal={mealEditor.mode === 'edit' ? mealEditor.meal : undefined}
                    initialDate={mealEditor.mode === 'add' ? mealEditor.date : undefined}
                    onSaved={() => setMealEditor(null)}
                  />
                </EditorPanel>
              )}
            </Card>
          )}
        </>
      ) : (
        <Empty
          title="No plans"
          body="Create a weekly plan. Empty plans and recipe libraries are supported."
        />
      )}
    </AppShell>
  );
}

function PlanPicker({
  heading,
  plans,
  selectedId,
  onSelect,
}: {
  heading: string;
  plans: WeeklyMealPlan[];
  selectedId?: string;
  onSelect(id: string): void;
}) {
  if (!plans.length) return null;
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[rgb(var(--muted))]">
        {heading}
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-2" role="list">
        {plans.map((plan) => {
          const active = plan.id === selectedId;
          return (
            <div key={plan.id} role="listitem" className="min-w-52 max-w-72 shrink-0">
              <button
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(plan.id)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-[rgb(var(--primary))] bg-[rgb(var(--primary-soft))] shadow-sm'
                    : 'border-[rgb(var(--border))] bg-[rgb(var(--surface))] hover:border-[rgb(var(--primary))]'
                }`}
              >
                <span className="block truncate text-sm font-semibold">{plan.name}</span>
                <span className="mt-1 block text-xs capitalize text-[rgb(var(--muted))]">
                  {plan.weekStartDate} · {plan.status}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditorPanel({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose(): void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[rgb(var(--border))] bg-[rgb(var(--primary-soft))]/35 p-5 md:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">{title}</h3>
          {description && <p className="mt-1 text-sm text-[rgb(var(--muted))]">{description}</p>}
        </div>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      {children}
    </section>
  );
}

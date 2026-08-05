'use client';

import { useState } from 'react';

import { AppShell } from '@/components/AppShell';
import { PlanForm } from '@/components/Forms';
import { Badge, Button, Card, Empty } from '@/components/ui';
import { repo } from '@/data/repository';
import type { MealEntry, MealType, WeeklyMealPlan } from '@/lib/types';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const mealTypes: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function addDays(date: string, offset: number) {
  const nextDate = new Date(`${date}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + offset);
  return nextDate.toISOString().slice(0, 10);
}

export default function Plans() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const plans = repo.plans();
  const recipes = repo.recipes();

  function refresh() {
    setRefreshToken((current) => current + 1);
  }

  function archivePlan(plan: WeeklyMealPlan) {
    if (window.confirm(`Archive ${plan.name}?`)) {
      repo.updatePlan(plan.id, { status: 'archived' });
      refresh();
    }
  }

  function deletePlan(plan: WeeklyMealPlan) {
    if (window.confirm(`Delete ${plan.name}?`)) {
      repo.deletePlan(plan.id);
      refresh();
    }
  }

  function moveMeal(planId: string, meal: MealEntry) {
    const nextDate = window.prompt('Move to date YYYY-MM-DD', meal.date) || meal.date;
    repo.upsertMeal(planId, { ...meal, date: nextDate });
    refresh();
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Weekly meal plans</h1>
      <Button type="button" onClick={() => setShowCreateForm((current) => !current)}>
        Create plan
      </Button>
      {showCreateForm ? (
        <Card>
          <PlanForm
            onSaved={() => {
              setShowCreateForm(false);
              refresh();
            }}
          />
        </Card>
      ) : null}
      {plans.length ? (
        <div data-refresh-token={refreshToken} className="space-y-4">
          {plans.map((plan) => (
            <Card key={plan.id}>
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  <p>
                    <Badge>{plan.status}</Badge> Week of {plan.weekStartDate}
                  </p>
                </div>
                <select
                  aria-label="Plan status"
                  className="rounded border p-2"
                  value={plan.status}
                  onChange={(event) => {
                    repo.updatePlan(plan.id, { status: event.target.value as WeeklyMealPlan['status'] });
                    refresh();
                  }}
                >
                  {['draft', 'active', 'completed', 'archived'].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-7">
                {days.map((day, dayIndex) => {
                  const date = addDays(plan.weekStartDate, dayIndex);
                  return (
                    <div key={day} className="rounded-xl border p-3">
                      <b>{day}</b>
                      <p className="text-xs text-slate-500">{date}</p>
                      {mealTypes.map((mealType) => {
                        const meal = plan.entries.find(
                          (entry) => entry.date === date && entry.mealType === mealType,
                        );
                        return (
                          <div key={mealType} className="my-2 rounded bg-slate-50 p-2 text-sm">
                            <span className="font-medium">{mealType}: </span>
                            {meal ? (
                              <>
                                <span>{recipes.find((recipe) => recipe.id === meal.recipeId)?.name}</span>
                                <button className="ml-2 underline" type="button" onClick={() => moveMeal(plan.id, meal)}>
                                  Move
                                </button>
                                <button
                                  className="ml-2 text-red-700 underline"
                                  type="button"
                                  onClick={() => {
                                    repo.removeMeal(plan.id, meal.id);
                                    refresh();
                                  }}
                                >
                                  Remove
                                </button>
                              </>
                            ) : (
                              <button
                                className="text-brand-700 underline"
                                type="button"
                                onClick={() => {
                                  repo.upsertMeal(plan.id, {
                                    id: `meal-${Date.now()}`,
                                    date,
                                    mealType,
                                    recipeId: recipes[0].id,
                                    servingCount: 4,
                                  });
                                  refresh();
                                }}
                              >
                                Add meal
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex gap-2">
                <Button type="button" onClick={() => archivePlan(plan)}>
                  Archive
                </Button>
                <Button className="bg-red-700" type="button" onClick={() => deletePlan(plan)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty title="No weekly plans" body="Create a plan to start scheduling meals." />
      )}
    </AppShell>
  );
}

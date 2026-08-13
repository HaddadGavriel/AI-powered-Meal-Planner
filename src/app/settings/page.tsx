'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Field } from '@/components/ui';
import { useMealPlanner } from '@/data/RepositoryProvider';
const split = (value: string) =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
export default function Settings() {
  const { data, user, repo, run } = useMealPlanner();
  const router = useRouter();
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [diet, setDiet] = useState({ patterns: '', allergens: '', excluded: '', preferences: '' });
  const [household, setHousehold] = useState({
    name: '',
    timezone: '',
    defaultServings: '4',
    notes: '',
  });
  useEffect(() => {
    if (!data || !user) return;
    const dietary = data.dietaryProfiles.find((candidate) => candidate.memberId === user.id);
    setProfile({ name: user.name, email: user.email });
    setDiet({
      patterns: dietary?.dietaryPatterns.join(', ') ?? '',
      allergens: dietary?.allergens.join(', ') ?? '',
      excluded: dietary?.excludedIngredients.join(', ') ?? '',
      preferences: dietary?.preferences ?? '',
    });
    setHousehold({
      name: data.household.name,
      timezone: data.household.timezone,
      defaultServings: String(data.household.defaultServings),
      notes: data.household.notes ?? '',
    });
  }, [data, user]);
  if (!data || !user) return null;
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Settings</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-xl font-semibold">Personal profile</h2>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => repo.updateProfile(profile), 'Profile updated.');
            }}
          >
            <Field
              label="Name"
              value={profile.name}
              onChange={(event) => setProfile({ ...profile, name: event.target.value })}
            />
            <Field
              label="Email"
              type="email"
              value={profile.email}
              onChange={(event) => setProfile({ ...profile, email: event.target.value })}
            />
            <Button>Save profile</Button>
          </form>
        </Card>
        <Card>
          <h2 className="text-xl font-semibold">My dietary profile</h2>
          <p className="text-sm text-[rgb(var(--muted))]">
            User-supplied, informational data only. Conflict notices never establish medical safety.
          </p>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void run(
                () =>
                  repo.updateDietaryProfile(user.id, {
                    dietaryPatterns: split(diet.patterns),
                    allergens: split(diet.allergens),
                    excludedIngredients: split(diet.excluded),
                    preferences: diet.preferences,
                  }),
                'Dietary preferences updated.',
              );
            }}
          >
            <Field
              label="Dietary patterns"
              value={diet.patterns}
              onChange={(event) => setDiet({ ...diet, patterns: event.target.value })}
            />
            <Field
              label="Allergens"
              value={diet.allergens}
              onChange={(event) => setDiet({ ...diet, allergens: event.target.value })}
            />
            <Field
              label="Disliked or excluded ingredients"
              value={diet.excluded}
              onChange={(event) => setDiet({ ...diet, excluded: event.target.value })}
            />
            <Field
              label="Preferences and constraints"
              value={diet.preferences}
              onChange={(event) => setDiet({ ...diet, preferences: event.target.value })}
            />
            <Button>Save dietary profile</Button>
          </form>
        </Card>
        {user.role !== 'member' && (
          <Card>
            <h2 className="text-xl font-semibold">Household</h2>
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  () =>
                    repo.updateHousehold({
                      name: household.name,
                      timezone: household.timezone,
                      defaultServings: Number(household.defaultServings),
                      notes: household.notes,
                    }),
                  'Household updated.',
                );
              }}
            >
              <Field
                label="Household name"
                value={household.name}
                onChange={(event) => setHousehold({ ...household, name: event.target.value })}
              />
              <Field
                label="Timezone"
                value={household.timezone}
                onChange={(event) => setHousehold({ ...household, timezone: event.target.value })}
              />
              <Field
                label="Default servings"
                type="number"
                min="1"
                value={household.defaultServings}
                onChange={(event) =>
                  setHousehold({ ...household, defaultServings: event.target.value })
                }
              />
              <Field
                label="Household notes"
                value={household.notes}
                onChange={(event) => setHousehold({ ...household, notes: event.target.value })}
              />
              <Button>Save household</Button>
            </form>
          </Card>
        )}
        <Card>
          <h2 className="text-xl font-semibold">Appearance</h2>
          <p>The header control accurately shows light, dark, or system mode.</p>
        </Card>
        {repo.capabilities.canReset && (
          <Card>
            <h2 className="text-xl font-semibold">Development data</h2>
            <Button
              variant="destructive"
              onClick={async () => {
                if (window.confirm('Reset all dummy data and sign out?')) {
                  await run(() => repo.reset());
                  router.replace('/login');
                }
              }}
            >
              Reset dummy data
            </Button>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

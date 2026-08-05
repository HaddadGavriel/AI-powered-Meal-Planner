'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { AppShell } from '@/components/AppShell';
import { Button, Card, Field } from '@/components/ui';
import { repo } from '@/data/repository';

export default function Settings() {
  const router = useRouter();
  const household = repo.household();
  const user = repo.currentUser();
  const [name, setName] = useState(household.name);

  function resetSeedData() {
    if (window.confirm('Reset seed data?')) {
      repo.reset();
      router.push('/login');
    }
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Settings</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Personal profile</h2>
          <p>{user?.name}</p>
          <p>{user?.email}</p>
          <p className="text-sm text-slate-500">Authentication is simulated for development.</p>
        </Card>
        <Card>
          <h2 className="font-semibold">Household details</h2>
          <Field label="Household name" value={name} onChange={(event) => setName(event.target.value)} />
          <Button className="mt-3" type="button" onClick={() => repo.updateHousehold({ ...household, name })}>
            Save household
          </Button>
        </Card>
        <Card>
          <h2 className="font-semibold">Appearance</h2>
          <p>Light, accessible interface is enabled. Theme storage can later move behind user preferences.</p>
        </Card>
        <Card>
          <h2 className="font-semibold">Development data</h2>
          <p className="text-sm text-slate-600">Reset localStorage to deterministic seed data.</p>
          <div className="mt-3 flex gap-2">
            <Button className="bg-red-700" type="button" onClick={resetSeedData}>
              Reset seed data
            </Button>
            <Button
              type="button"
              onClick={() => {
                repo.logout();
                router.push('/login');
              }}
            >
              Logout
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

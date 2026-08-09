'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field, Select } from '@/components/ui';
import { useMealPlanner } from '@/data/RepositoryProvider';

export default function Login() {
  const { repo, run } = useMealPlanner();
  const router = useRouter();
  const mockMode = repo.capabilities.mode === 'mock';
  const [email, setEmail] = useState(mockMode ? repo.demo.accounts[0].email : '');
  const [password, setPassword] = useState(mockMode ? repo.demo.password : '');

  return (
    <main className="container-page grid min-h-screen place-items-center">
      <Card className="w-full max-w-md">
        <h1 className="text-3xl font-bold">Sign in to Meal Planner</h1>
        <p className="mt-2 text-sm text-[rgb(var(--muted))]">
          {mockMode ? 'Simulated authentication. Choose any seeded role.' : 'Sign in with your Meal Planner account.'}
        </p>
        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const session = await run(() => repo.login(email, password), 'Signed in.');
            if (session) router.push('/dashboard');
          }}
        >
          {mockMode ? (
            <Select label="Demo account" value={email} onChange={(event) => setEmail(event.target.value)}>
              {repo.demo.accounts.map((account) => (
                <option value={account.email} key={account.email}>{account.role}: {account.email}</option>
              ))}
            </Select>
          ) : (
            <Field required label="Email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          )}
          <Field required label="Password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <Button className="w-full">Sign in</Button>
        </form>
      </Card>
    </main>
  );
}

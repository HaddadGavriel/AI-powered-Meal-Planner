'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Field } from '@/components/ui';
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
          {mockMode
            ? 'Use a demo account or an account accepted through an invitation.'
            : 'Sign in with your Meal Planner account.'}
        </p>
        <form
          className="mt-6 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const session = await run(() => repo.login(email, password), 'Signed in.');
            if (session) router.push('/dashboard');
          }}
        >
          <Field
            required
            label="Email"
            type="email"
            autoComplete="email"
            list={mockMode ? 'demo-accounts' : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {mockMode && (
            <datalist id="demo-accounts">
              {repo.demo.accounts.map((account) => (
                <option value={account.email} key={account.email} />
              ))}
            </datalist>
          )}
          <Field
            required
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Button className="w-full">Sign in</Button>
        </form>
      </Card>
    </main>
  );
}

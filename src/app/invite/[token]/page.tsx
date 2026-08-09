'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Field } from '@/components/ui';
import { useMealPlanner } from '@/data/RepositoryProvider';
import type { Invitation } from '@/lib/types';
export default function AcceptInvitation({
  params,
}: {
  params: Promise<{
    token: string;
  }>;
}) {
  const { token } = use(params);
  const { repo } = useMealPlanner();
  const router = useRouter();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    repo
      .inspectInvitation(token)
      .then(setInvitation)
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Invitation not found.');
      });
  }, [repo, token]);
  return (
    <main className="container-page grid min-h-screen place-items-center">
      <Card className="w-full max-w-lg">
        <h1 className="text-2xl font-bold">Join the household</h1>
        {error && (
          <p role="alert" className="mt-3 text-red-700">
            {error}
          </p>
        )}
        {invitation && (
          <>
            <p className="mt-3">
              {invitation.email} was invited as {invitation.proposedRole}.
            </p>
            {invitation.status !== 'pending' ? (
              <p className="mt-3">This invitation is {invitation.status} and cannot be used.</p>
            ) : (
              <form
                className="mt-4 space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError('');
                  try {
                    await repo.acceptInvitation(token, name, password);
                    router.push('/dashboard');
                  } catch (caught) {
                    setError(
                      caught instanceof Error ? caught.message : 'Unable to accept invitation.',
                    );
                  }
                }}
              >
                <Field
                  required
                  label="Display name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <Field
                  required
                  label="Create password"
                  type="password"
                  minLength={8}
                  autoComplete="new-password"
                  description="Use at least 8 characters. Sign in later with the invited email and this password."
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <Button>Accept invitation and sign in</Button>
              </form>
            )}
          </>
        )}
        <Link className="mt-4 block underline" href="/login">
          Go to sign in
        </Link>
      </Card>
    </main>
  );
}

'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMealPlanner } from '@/data/RepositoryProvider';
import type { Invitation } from '@/lib/types';
import { Button, Card, Field } from '@/components/ui';
export default function Accept({ params }: {
    params: Promise<{
        token: string;
    }>;
}) {
    const { token } = use(params), { repo } = useMealPlanner(), [inv, setInv] = useState<Invitation | null>(null), [error, setError] = useState(''), [name, setName] = useState(''), [accepted, setAccepted] = useState(false);
    useEffect(() => { repo.inspectInvitation(token).then(setInv).catch(e => setError(e.message)); }, [repo, token]);
    return <main className="container-page grid min-h-screen place-items-center">
<Card className="max-w-lg">
<h1 className="text-2xl font-bold">Invitation preview</h1>
{error && <p role="alert">{error}</p>}{inv && <>
<p>{inv.email} was invited as {inv.proposedRole}.</p>
{inv.status !== 'pending' ? <p>This invitation is {inv.status} and cannot be used.</p> : accepted ? <p>Invitation accepted. The offer is now used and the person is an active member.</p> : <form onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                        await repo.acceptInvitation(token, name);
                        setAccepted(true);
                    }
                    catch (x) {
                        setError(x instanceof Error ? x.message : 'Unable to accept');
                    }
                }}>
<Field required label="Display name" value={name} onChange={e => setName(e.target.value)}/>
<Button className="mt-3">Accept invitation</Button>
</form>}</>}<Link className="mt-4 block underline" href="/household">Back to household</Link>
</Card>
</main>;
}

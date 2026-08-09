'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, Field, Select } from '@/components/ui';
import { useMealPlanner } from '@/data/RepositoryProvider';
export default function Household() {
  const { data, user, repo, run } = useMealPlanner();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'administrator'>('member');
  const [acceptanceUrls, setAcceptanceUrls] = useState<Record<string, string>>({});
  if (!data) return null;
  const canManage = user?.role !== 'member';
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">{data.household.name}</h1>
      <Card>
        <h2 className="text-xl font-semibold">Members</h2>
        {data.members.map((member) => {
          const canManageMember =
            canManage &&
            member.id !== user?.id &&
            (member.role !== 'owner' || user?.role === 'owner');
          return (
            <div className="flex flex-wrap items-center gap-3 border-b py-3" key={member.id}>
              <span className="flex-1">
                {member.name} · {member.email}
              </span>
              <Badge>{member.role}</Badge>
              {canManageMember && (
                <>
                  <Select
                    aria-label={`Role for ${member.name}`}
                    label="Role"
                    value={member.role}
                    onChange={(event) =>
                      run(
                        () => repo.changeRole(member.id, event.target.value as typeof member.role),
                        'Role updated.',
                      )
                    }
                  >
                    <option>member</option>
                    <option>administrator</option>
                    {user?.role === 'owner' && <option>owner</option>}
                  </Select>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm(`Remove ${member.name} from the household?`)) {
                        void run(() => repo.removeMember(member.id), 'Member removed.');
                      }
                    }}
                  >
                    Remove
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </Card>
      {canManage && (
        <Card>
          <h2 className="text-xl font-semibold">Invitations</h2>
          <p className="text-sm text-[rgb(var(--muted))]">
            No email is sent. Preview the single-use acceptance flow safely.
          </p>
          <form
            className="my-3 flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const invitation = await run(() => repo.invite(email, role), 'Invitation created.');
              if (invitation) setEmail('');
            }}
          >
            <Field
              required
              type="email"
              label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Select
              label="Proposed role"
              value={role}
              onChange={(event) => setRole(event.target.value as typeof role)}
            >
              <option>member</option>
              <option>administrator</option>
            </Select>
            <Button className="self-end">Invite</Button>
          </form>
          {data.invitations.map((invitation) => (
            <div className="flex flex-wrap items-center gap-2 border-b py-2" key={invitation.id}>
              <span className="flex-1">
                {invitation.email} · {invitation.proposedRole}
              </span>
              <Badge>{invitation.status}</Badge>
              {invitation.status === 'pending' && (
                <>
                  {acceptanceUrls[invitation.id] ? (
                    <Link className="underline" href={acceptanceUrls[invitation.id]}>
                      Open acceptance preview
                    </Link>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        const url = await run(() => repo.getInvitationAcceptanceUrl(invitation.id));
                        if (url)
                          setAcceptanceUrls((current) => ({ ...current, [invitation.id]: url }));
                      }}
                    >
                      Generate preview link
                    </Button>
                  )}
                  <>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        run(
                          () => repo.resendInvitation(invitation.id),
                          'Invitation resent with a new token.',
                        )
                      }
                    >
                      Resend
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        run(() => repo.revokeInvitation(invitation.id), 'Invitation revoked.')
                      }
                    >
                      Revoke
                    </Button>
                  </>
                </>
              )}
            </div>
          ))}
        </Card>
      )}
    </AppShell>
  );
}

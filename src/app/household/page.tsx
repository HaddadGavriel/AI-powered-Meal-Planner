'use client';

import { useState } from 'react';

import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, Field, Select } from '@/components/ui';
import { repo } from '@/data/repository';
import type { Member, Role } from '@/lib/types';

export default function Household() {
  const [refreshToken, setRefreshToken] = useState(0);
  const [email, setEmail] = useState('new.member@example.com');
  const [error, setError] = useState('');
  const members = repo.members();

  function refresh() {
    setRefreshToken((current) => current + 1);
  }

  function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.name}?`)) {
      return;
    }

    try {
      repo.removeMember(member.id);
      setError('');
    } catch (caught) {
      setError((caught as Error).message);
    }
    refresh();
  }

  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Household members</h1>
      {error ? (
        <p role="alert" className="rounded bg-red-50 p-3 text-red-700">
          {error}
        </p>
      ) : null}
      <Card>
        <h2 className="font-semibold">Invite someone</h2>
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            repo.invite(email, 'member');
            refresh();
          }}
        >
          <Field label="Email" value={email} onChange={(event) => setEmail(event.target.value)} />
          <Button>Send simulated invitation</Button>
        </form>
      </Card>
      <Card>
        <h2 className="font-semibold">Active members</h2>
        <div className="overflow-x-auto" data-refresh-token={refreshToken}>
          <table className="w-full text-left text-sm">
            <tbody>
              {members.map((member) => (
                <tr className="border-t" key={member.id}>
                  <td className="py-3">
                    <b>{member.name}</b>
                    <br />
                    {member.email}
                  </td>
                  <td>
                    <Badge>{member.status}</Badge>
                  </td>
                  <td>
                    <Select
                      label="Role"
                      value={member.role}
                      onChange={(event) => {
                        try {
                          repo.changeRole(member.id, event.target.value as Role);
                          setError('');
                        } catch (caught) {
                          setError((caught as Error).message);
                        }
                        refresh();
                      }}
                    >
                      <option value="owner">Owner</option>
                      <option value="administrator">Administrator</option>
                      <option value="member">Member</option>
                    </Select>
                  </td>
                  <td>
                    <Button className="bg-red-700" type="button" onClick={() => removeMember(member)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <h2 className="font-semibold">Pending invitations</h2>
        {repo.invitations().map((invitation) => (
          <p className="flex flex-wrap items-center gap-2 border-t py-3" key={invitation.id}>
            {invitation.email} <Badge>{invitation.role}</Badge>
            <Button
              type="button"
              onClick={() => {
                repo.resendInvitation(invitation.id);
                refresh();
              }}
            >
              Resend
            </Button>
            <Button
              className="bg-red-700"
              type="button"
              onClick={() => {
                repo.cancelInvitation(invitation.id);
                refresh();
              }}
            >
              Cancel
            </Button>
          </p>
        ))}
      </Card>
    </AppShell>
  );
}

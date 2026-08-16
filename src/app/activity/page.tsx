'use client';
import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Card, Empty, Select } from '@/components/ui';
import { useMealPlanner } from '@/data/RepositoryProvider';
export default function Activity() {
  const { data } = useMealPlanner(),
    [type, setType] = useState('all');
  if (!data) return <AppShell>{null}</AppShell>;
  const events = data.auditEvents.filter((x) => type === 'all' || x.entityType === type),
    types = [...new Set(data.auditEvents.map((x) => x.entityType))];
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Activity</h1>
      <Card>
        <Select label="Entity type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All activity</option>
          {types.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </Select>
        <p className="mt-2 text-sm">
          Mock history is append-only in the UI. The future backend is authoritative.
        </p>
      </Card>
      {events.length ? (
        events.map((e) => (
          <Card key={e.id}>
            <strong>{e.summary}</strong>
            <p className="text-sm text-[rgb(var(--muted))]">
              {e.action} · {e.entityType} · {new Date(e.timestamp).toLocaleString()}
            </p>
          </Card>
        ))
      ) : (
        <Empty title="No matching activity" body="Choose another filter." />
      )}
    </AppShell>
  );
}

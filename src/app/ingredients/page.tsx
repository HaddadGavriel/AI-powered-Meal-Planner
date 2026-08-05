'use client';

import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { IngredientForm } from '@/components/Forms';
import { Badge, Button, Card, Empty, Field, Select } from '@/components/ui';
import { repo } from '@/data/repository';

export default function Ingredients() {
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [show, setShow] = useState(false);
  const items = repo
    .ingredients()
    .filter(i => i.name.toLowerCase().includes(q.toLowerCase()) && (cat === 'All' || i.category === cat));

  return (
    <AppShell>
      <h1 className="text-3xl font-bold tracking-tight">Ingredients</h1>
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Search" value={q} onChange={e => setQ(e.target.value)} />
          <Select label="Category" value={cat} onChange={e => setCat(e.target.value)}>
            {['All', 'Produce', 'Dairy', 'Grains', 'Meat and poultry', 'Seafood', 'Legumes', 'Spices', 'Condiments', 'Baking', 'Other'].map(x => (
              <option key={x}>{x}</option>
            ))}
          </Select>
          <Button onClick={() => setShow(!show)}>Create ingredient</Button>
        </div>
        {show && (
          <div className="mt-4">
            <IngredientForm
              onSaved={() => {
                setShow(false);
                setTick(tick + 1);
              }}
            />
          </div>
        )}
      </Card>
      {items.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map(i => (
            <Card key={i.id}>
              <h2 className="text-xl font-semibold">{i.name}</h2>
              <p>
                <Badge>{i.category}</Badge> {i.defaultUnit} · {i.status}
              </p>
              <p className="text-sm text-[rgb(var(--muted))]">{i.notes}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={() => {
                    repo.updateIngredient(i.id, { status: i.status === 'active' ? 'archived' : 'active' });
                    setTick(tick + 1);
                  }}
                >
                  {i.status === 'active' ? 'Archive' : 'Restore'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (confirm('Delete ingredient?')) {
                      repo.deleteIngredient(i.id);
                      setTick(tick + 1);
                    }
                  }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty title="No ingredients" body="Try another filter or create an ingredient." />
      )}
    </AppShell>
  );
}

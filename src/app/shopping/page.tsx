'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { Button, Card, Empty, Field, Select } from '@/components/ui';
import { useMealPlanner } from '@/data/RepositoryProvider';
import type { ShoppingList, ShoppingListItem } from '@/lib/types';
type Item = ShoppingList['items'][number];
function ShoppingItemEditor({
  item,
  list,
  onSave,
}: {
  item: Item;
  list: ShoppingList;
  onSave(items: Item[]): Promise<unknown>;
}) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit);
  const [validation, setValidation] = useState('');
  useEffect(() => {
    setQuantity(String(item.quantity));
    setUnit(item.unit);
  }, [item.quantity, item.unit]);
  return (
    <form
      className="contents"
      onSubmit={async (event) => {
        event.preventDefault();
        const parsedQuantity = Number(quantity);
        if (!quantity.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
          setValidation('Quantity must be greater than zero.');
          return;
        }
        if (!unit.trim()) {
          setValidation('Unit is required.');
          return;
        }
        setValidation('');
        await onSave(
          list.items.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, quantity: parsedQuantity, unit: unit.trim() }
              : candidate,
          ),
        );
      }}
    >
      <Field
        label="Quantity"
        inputMode="decimal"
        value={quantity}
        aria-invalid={Boolean(validation)}
        onChange={(event) => setQuantity(event.target.value)}
      />
      <Field
        label="Unit"
        value={unit}
        aria-invalid={Boolean(validation)}
        onChange={(event) => setUnit(event.target.value)}
      />
      <div className="self-end">
        <Button type="submit" variant="secondary">
          Save
        </Button>
        {validation && (
          <p role="alert" className="mt-1 text-xs text-red-700">
            {validation}
          </p>
        )}
      </div>
    </form>
  );
}
export default function Shopping() {
  const { data, user, repo, run } = useMealPlanner();
  const [planId, setPlanId] = useState('');
  const [manual, setManual] = useState({
    name: '',
    quantity: '1',
    unit: 'pieces',
    category: 'Other',
  });
  const [manualError, setManualError] = useState('');
  if (!data) return <AppShell>{null}</AppShell>;
  const canManage = user?.role !== 'member';
  const selectedPlanId = planId || data.plans[0]?.id || '';
  const list = data.shoppingLists.find((candidate) => candidate.planId === selectedPlanId);
  const updateItems = (target: ShoppingList, items: ShoppingListItem[]) =>
    run(() => repo.updateShoppingList(target.id, { items }), 'Shopping list updated.');
  return (
    <AppShell>
      <h1 className="text-3xl font-bold">Shopping lists</h1>
      <Card>
        <div className="flex gap-3">
          <Select
            label="Source plan"
            value={selectedPlanId}
            onChange={(event) => setPlanId(event.target.value)}
          >
            {data.plans.map((plan) => (
              <option value={plan.id} key={plan.id}>
                {plan.name}
              </option>
            ))}
          </Select>
          {canManage && (
            <Button
              disabled={!selectedPlanId}
              className="self-end"
              onClick={() =>
                run(
                  () => repo.generateShoppingList(selectedPlanId),
                  list ? 'Shopping list regenerated.' : 'Shopping list generated.',
                )
              }
            >
              {list ? 'Regenerate' : 'Generate'} list
            </Button>
          )}
        </div>
      </Card>

      {list ? (
        <Card>
          <h2 className="text-xl font-semibold">{list.name}</h2>
          {list.items.map((item) => (
            <div
              className={`grid items-end gap-2 border-b py-3 ${canManage ? 'md:grid-cols-[auto_1fr_7rem_7rem_7rem_auto]' : 'grid-cols-[1fr_auto]'}`}
              key={item.id}
            >
              {canManage && (
                <input
                  aria-label={`Check ${item.name}`}
                  type="checkbox"
                  checked={item.checked}
                  onChange={(event) =>
                    void run(
                      () =>
                        repo.updateShoppingList(list.id, {
                          items: list.items.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, checked: event.target.checked }
                              : candidate,
                          ),
                        }),
                      'Shopping list updated.',
                    )
                  }
                />
              )}
              <span className={item.checked ? 'line-through' : ''}>
                {item.name}{' '}
                <small>
                  ({item.category}, {item.source})
                </small>
              </span>
              {canManage ? (
                <>
                  <ShoppingItemEditor
                    item={item}
                    list={list}
                    onSave={(items) => updateItems(list, items)}
                  />
                  <Button
                    className="self-end"
                    variant="destructive"
                    onClick={() =>
                      run(
                        () =>
                          repo.updateShoppingList(list.id, {
                            items: list.items.filter((candidate) => candidate.id !== item.id),
                          }),
                        'Item removed.',
                      )
                    }
                  >
                    Remove
                  </Button>
                </>
              ) : (
                <span>
                  {item.quantity} {item.unit}
                </span>
              )}
            </div>
          ))}

          {canManage && (
            <form
              className="mt-4 grid gap-2 md:grid-cols-5"
              onSubmit={async (event) => {
                event.preventDefault();
                const quantity = Number(manual.quantity);
                if (
                  !manual.name.trim() ||
                  !manual.quantity.trim() ||
                  quantity <= 0 ||
                  !manual.unit.trim()
                ) {
                  setManualError('Enter a name, positive quantity, and unit.');
                  return;
                }
                setManualError('');
                const result = await run(
                  () =>
                    repo.updateShoppingList(list.id, {
                      items: [
                        ...list.items,
                        {
                          id: `manual-${crypto.randomUUID()}`,
                          name: manual.name.trim(),
                          quantity,
                          unit: manual.unit.trim(),
                          category: manual.category.trim() || 'Other',
                          checked: false,
                          source: 'manual',
                        },
                      ],
                    }),
                  'Manual item added.',
                );
                if (result) setManual((current) => ({ ...current, name: '' }));
              }}
            >
              <Field
                required
                label="Manual item"
                value={manual.name}
                onChange={(event) => setManual({ ...manual, name: event.target.value })}
              />
              <Field
                label="Quantity"
                inputMode="decimal"
                value={manual.quantity}
                onChange={(event) => setManual({ ...manual, quantity: event.target.value })}
              />
              <Field
                label="Unit"
                value={manual.unit}
                onChange={(event) => setManual({ ...manual, unit: event.target.value })}
              />
              <Field
                label="Category"
                value={manual.category}
                onChange={(event) => setManual({ ...manual, category: event.target.value })}
              />
              <Button className="self-end">Add manual item</Button>
              {manualError && (
                <p role="alert" className="text-sm text-red-700 md:col-span-5">
                  {manualError}
                </p>
              )}
            </form>
          )}
          {canManage && (
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => run(() => repo.clearChecked(list.id), 'Checked items cleared.')}
            >
              Clear checked
            </Button>
          )}
        </Card>
      ) : (
        <Empty
          title="No shopping list"
          body={
            data.plans.length
              ? 'Generate one from the selected plan.'
              : 'Create a weekly plan first.'
          }
        />
      )}
    </AppShell>
  );
}

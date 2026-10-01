'use client';

import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { useAction } from '@/components/useAction';
import type { StockRow, Warehouse } from '@/lib/api/admin-ops-types';
import { bff } from '@/lib/api/client';

const REASONS = [
  'Stock count correction',
  'Received from supplier',
  'Customer return restocked',
  'Damaged in warehouse',
  'Returned to supplier',
  'Lost or stolen',
];

/** Signed stock correction (REQ-27): the API refuses anything below what is reserved. */
export function AdjustStockForm({
  warehouses,
  initialVariantId,
  initialWarehouseId,
  selectedSku,
}: {
  warehouses: Warehouse[];
  initialVariantId?: string;
  initialWarehouseId?: string;
  /** SKU of the row the variant ID came from, as a reminder of what is being adjusted. */
  selectedSku?: string;
}) {
  const action = useAction();
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId ?? warehouses[0]?.id ?? '');
  const [variantId, setVariantId] = useState(initialVariantId ?? '');
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  return (
    <form
      className="panel stack"
      aria-labelledby="adjust-heading"
      onSubmit={async (e) => {
        e.preventDefault();
        const amount = Number.parseInt(quantity, 10);
        if (!Number.isInteger(amount) || amount < 1) {
          action.setError('Quantity must be a whole number of at least 1.');
          return;
        }
        const signed = direction === 'in' ? amount : -amount;
        const result = await action.run(
          () =>
            bff<StockRow>('/admin/inventory/adjustments', {
              method: 'POST',
              body: {
                warehouseId,
                variantId: variantId.trim(),
                quantity: signed,
                reason: reason.trim(),
                ...(note.trim() ? { note: note.trim() } : {}),
              },
            }),
          { success: `Stock ${direction === 'in' ? 'received' : 'written off'}.` },
        );
        if (result) {
          setQuantity('1');
          setReason('');
          setNote('');
        }
      }}
    >
      <h2 id="adjust-heading">Adjust stock</h2>
      <FormStatus error={action.error} message={action.message} />
      <div className="field">
        <label htmlFor="adjust-warehouse">Warehouse</label>
        <select id="adjust-warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.code} · {warehouse.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="adjust-variant">Variant ID</label>
        <input
          id="adjust-variant"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          required
          aria-describedby="adjust-variant-hint"
        />
        <span className="hint" id="adjust-variant-hint">
          {selectedSku && variantId === initialVariantId
            ? `SKU ${selectedSku}`
            : 'Choose “Adjust” on a stock row to fill this in.'}
        </span>
      </div>
      <div className="row" style={{ alignItems: 'end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="adjust-direction">Change</label>
          <select id="adjust-direction" value={direction} onChange={(e) => setDirection(e.target.value as 'in' | 'out')}>
            <option value="in">Receive (+)</option>
            <option value="out">Write off (−)</option>
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="adjust-quantity">Quantity</label>
          <input
            id="adjust-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="adjust-reason">Reason</label>
        <input
          id="adjust-reason"
          list="adjust-reasons"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={3}
          maxLength={200}
          required
        />
        <datalist id="adjust-reasons">
          {REASONS.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label htmlFor="adjust-note">Note (optional)</label>
        <textarea id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} />
      </div>
      <button type="submit" disabled={action.pending || !warehouseId}>
        {direction === 'in' ? 'Receive stock' : 'Write off stock'}
      </button>
    </form>
  );
}

/** The stock row for a variant in a warehouse; opening stock is ledgered as a receipt. */
export function AddStockItemForm({ warehouses }: { warehouses: Warehouse[] }) {
  const action = useAction();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [variantId, setVariantId] = useState('');
  const [onHand, setOnHand] = useState('0');

  return (
    <form
      className="panel stack"
      aria-labelledby="add-item-heading"
      onSubmit={async (e) => {
        e.preventDefault();
        const opening = Number.parseInt(onHand || '0', 10);
        if (!Number.isInteger(opening) || opening < 0) {
          action.setError('Opening stock must be a whole number, 0 or more.');
          return;
        }
        const result = await action.run(
          () =>
            bff<StockRow>('/admin/inventory/items', {
              method: 'POST',
              body: { warehouseId, variantId: variantId.trim(), onHand: opening },
            }),
          { success: 'Stock item created.' },
        );
        if (result) {
          setVariantId('');
          setOnHand('0');
        }
      }}
    >
      <h2 id="add-item-heading">Stock a new variant</h2>
      <FormStatus error={action.error} message={action.message} />
      <div className="field">
        <label htmlFor="item-warehouse">Warehouse</label>
        <select id="item-warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.code} · {warehouse.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="item-variant">Variant ID</label>
        <input
          id="item-variant"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          required
          aria-describedby="item-variant-hint"
        />
        <span className="hint" id="item-variant-hint">
          From the product’s variants in the catalog admin.
        </span>
      </div>
      <div className="field">
        <label htmlFor="item-onhand">Opening stock</label>
        <input
          id="item-onhand"
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={onHand}
          onChange={(e) => setOnHand(e.target.value)}
        />
      </div>
      <button type="submit" className="secondary" disabled={action.pending || !warehouseId}>
        Create stock item
      </button>
    </form>
  );
}

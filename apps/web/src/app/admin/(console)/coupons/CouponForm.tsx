'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormStatus } from '@/components/FormStatus';
import { fromKarachiInput, toKarachiInput } from '@/components/admin/ops/time';
import { useAction } from '@/components/useAction';
import type { Coupon, CouponApplies, CouponType } from '@/lib/api/admin-ops-types';
import { bff } from '@/lib/api/client';

const MONEY = /^\d+(\.\d{1,2})?$/;

const TYPES: Record<CouponType, string> = {
  PERCENT: 'Percentage off',
  FIXED: 'Fixed amount off (Rs)',
  FREE_SHIPPING: 'Free delivery',
};

const APPLIES: Record<CouponApplies, string> = {
  ALL: 'Whole order',
  CATEGORY: 'Categories (and their subcategories)',
  BRAND: 'Brands',
  PRODUCT: 'Products',
};

interface Fields {
  code: string;
  type: CouponType;
  value: string;
  maxDiscount: string;
  minOrderValue: string;
  usageLimit: string;
  perCustomerLimit: string;
  appliesTo: CouponApplies;
  appliesIds: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
}

function initial(coupon?: Coupon, defaultStart?: string): Fields {
  return {
    code: coupon?.code ?? '',
    type: coupon?.type ?? 'PERCENT',
    value: coupon?.value ?? '',
    maxDiscount: coupon?.maxDiscount ?? '',
    minOrderValue: coupon?.minOrderValue ?? '',
    usageLimit: coupon?.usageLimit?.toString() ?? '',
    perCustomerLimit: coupon?.perCustomerLimit?.toString() ?? '',
    appliesTo: coupon?.appliesTo ?? 'ALL',
    appliesIds: coupon?.appliesIds.join('\n') ?? '',
    validFrom: toKarachiInput(coupon?.validFrom ?? defaultStart),
    validTo: toKarachiInput(coupon?.validTo),
    isActive: coupon?.isActive ?? true,
  };
}

/** Labels of optional limits that the API keeps once set (UpdateCouponDto takes no nulls). */
const STICKY: { key: keyof Fields; label: string }[] = [
  { key: 'maxDiscount', label: 'Maximum discount' },
  { key: 'minOrderValue', label: 'Minimum order' },
  { key: 'usageLimit', label: 'Total uses' },
  { key: 'perCustomerLimit', label: 'Uses per customer' },
  { key: 'validTo', label: 'Valid until' },
];

/**
 * Builds the request body, or returns the reason it cannot. Only fields the DTOs
 * know are sent (the API rejects unknown ones), and blanks are left out.
 */
function toBody(fields: Fields, original?: Coupon): Record<string, unknown> | string {
  const body: Record<string, unknown> = {};
  const editing = Boolean(original);

  if (!editing) {
    const code = fields.code.trim().toUpperCase();
    // Same rule as normalizeCouponCode in the API.
    if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(code)) return 'Code must be 3–32 letters, numbers or hyphens.';
    body.code = code;
    body.type = fields.type;
  }

  if (fields.type === 'FREE_SHIPPING') {
    if (!editing) body.value = '0';
  } else {
    if (!MONEY.test(fields.value.trim())) return 'Value must be an amount such as 500 or 10.50.';
    if (fields.type === 'PERCENT' && Number(fields.value) > 100) return 'A percentage cannot exceed 100.';
    body.value = fields.value.trim();
  }

  for (const key of ['maxDiscount', 'minOrderValue'] as const) {
    const value = fields[key].trim();
    if (!value) continue;
    if (!MONEY.test(value)) return `${key === 'maxDiscount' ? 'Maximum discount' : 'Minimum order'} must be an amount.`;
    body[key] = value;
  }
  for (const key of ['usageLimit', 'perCustomerLimit'] as const) {
    const value = fields[key].trim();
    if (!value) continue;
    if (!/^\d+$/.test(value) || Number(value) < 1) return 'Usage limits must be whole numbers of at least 1.';
    body[key] = Number(value);
  }

  body.appliesTo = fields.appliesTo;
  const ids = fields.appliesIds
    .split(/[\s,]+/)
    .map((id) => id.trim())
    .filter(Boolean);
  if (fields.appliesTo === 'ALL') {
    if (editing && original?.appliesIds.length) body.appliesIds = [];
  } else {
    if (ids.length === 0) return `List at least one ${fields.appliesTo.toLowerCase()} ID.`;
    body.appliesIds = [...new Set(ids)];
  }

  const validFrom = fromKarachiInput(fields.validFrom);
  if (!validFrom) return 'Choose when the coupon starts.';
  body.validFrom = validFrom;
  if (fields.validTo) {
    const validTo = fromKarachiInput(fields.validTo);
    if (!validTo) return 'Valid until is not a valid date.';
    if (validTo < validFrom) return 'Valid until must be after the start.';
    body.validTo = validTo;
  }
  // Editing leaves the flag to the Activate/Deactivate button, so the two never fight.
  if (!editing) body.isActive = fields.isActive;

  if (original) {
    const was = initial(original);
    const cleared = STICKY.filter(({ key }) => was[key] !== '' && fields[key] === '');
    if (cleared.length > 0) {
      return `${cleared.map((c) => c.label).join(', ')} cannot be removed once set. Enter a new value, or deactivate this coupon and create another.`;
    }
  }
  return body;
}

/** `defaultStart` comes from the server so the first render matches on both sides. */
export function CouponForm({ coupon, defaultStart }: { coupon?: Coupon; defaultStart?: string }) {
  const router = useRouter();
  const action = useAction();
  const [fields, setFields] = useState<Fields>(() => initial(coupon, defaultStart));
  const set =
    <K extends keyof Fields>(key: K) =>
    (value: Fields[K]) =>
      setFields((current) => ({ ...current, [key]: value }));
  const text = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((current) => ({ ...current, [key]: e.target.value }));

  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = toBody(fields, coupon);
        if (typeof body === 'string') {
          action.setError(body);
          return;
        }
        if (coupon) {
          await action.run(() => bff(`/admin/coupons/${coupon.id}`, { method: 'PATCH', body }), {
            success: 'Coupon saved.',
          });
          return;
        }
        const created = await action.run(() => bff<Coupon>('/admin/coupons', { method: 'POST', body }), {
          refresh: false,
        });
        if (created) router.push(`/admin/coupons/${created.data.id}?created=1`);
      }}
    >
      <FormStatus error={action.error} message={action.message} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="coupon-code">Code</label>
          <input
            id="coupon-code"
            value={fields.code}
            onChange={text('code')}
            disabled={Boolean(coupon)}
            maxLength={32}
            required
            style={{ textTransform: 'uppercase' }}
            aria-describedby="coupon-code-hint"
          />
          <span className="hint" id="coupon-code-hint">
            {coupon ? 'A code cannot be changed.' : 'What shoppers type at checkout, e.g. EID2026.'}
          </span>
        </div>
        <div className="field">
          <label htmlFor="coupon-type">Type</label>
          <select
            id="coupon-type"
            value={fields.type}
            onChange={(e) => set('type')(e.target.value as CouponType)}
            disabled={Boolean(coupon)}
          >
            {(Object.keys(TYPES) as CouponType[]).map((type) => (
              <option key={type} value={type}>
                {TYPES[type]}
              </option>
            ))}
          </select>
        </div>
        {fields.type !== 'FREE_SHIPPING' ? (
          <div className="field">
            <label htmlFor="coupon-value">{fields.type === 'PERCENT' ? 'Percent off' : 'Amount off (Rs)'}</label>
            <input
              id="coupon-value"
              inputMode="decimal"
              value={fields.value}
              onChange={text('value')}
              required
              placeholder={fields.type === 'PERCENT' ? '10' : '1000'}
            />
          </div>
        ) : null}
        {fields.type === 'PERCENT' ? (
          <div className="field">
            <label htmlFor="coupon-max">Maximum discount (Rs, optional)</label>
            <input id="coupon-max" inputMode="decimal" value={fields.maxDiscount} onChange={text('maxDiscount')} />
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="coupon-min">Minimum order (Rs, optional)</label>
          <input id="coupon-min" inputMode="decimal" value={fields.minOrderValue} onChange={text('minOrderValue')} />
        </div>
        <div className="field">
          <label htmlFor="coupon-usage">Total uses (optional)</label>
          <input
            id="coupon-usage"
            type="number"
            min={1}
            step={1}
            value={fields.usageLimit}
            onChange={text('usageLimit')}
            placeholder="Unlimited"
          />
        </div>
        <div className="field">
          <label htmlFor="coupon-per-customer">Uses per customer (optional)</label>
          <input
            id="coupon-per-customer"
            type="number"
            min={1}
            step={1}
            value={fields.perCustomerLimit}
            onChange={text('perCustomerLimit')}
            placeholder="Unlimited"
          />
        </div>
        <div className="field">
          <label htmlFor="coupon-from">Valid from (Pakistan time)</label>
          <input
            id="coupon-from"
            type="datetime-local"
            value={fields.validFrom}
            onChange={text('validFrom')}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="coupon-to">Valid until (optional)</label>
          <input id="coupon-to" type="datetime-local" value={fields.validTo} onChange={text('validTo')} />
        </div>
        <div className="field">
          <label htmlFor="coupon-applies">Applies to</label>
          <select
            id="coupon-applies"
            value={fields.appliesTo}
            onChange={(e) => set('appliesTo')(e.target.value as CouponApplies)}
          >
            {(Object.keys(APPLIES) as CouponApplies[]).map((applies) => (
              <option key={applies} value={applies}>
                {APPLIES[applies]}
              </option>
            ))}
          </select>
        </div>
        {fields.appliesTo !== 'ALL' ? (
          <div className="field wide">
            <label htmlFor="coupon-ids">{APPLIES[fields.appliesTo]}: IDs</label>
            <textarea
              id="coupon-ids"
              rows={3}
              value={fields.appliesIds}
              onChange={text('appliesIds')}
              aria-describedby="coupon-ids-hint"
            />
            <span className="hint" id="coupon-ids-hint">
              One ID per line (or comma separated), copied from the catalog admin. Up to 200.
            </span>
          </div>
        ) : null}
        {coupon ? null : (
          <label className="check wide" htmlFor="coupon-active">
            <input
              id="coupon-active"
              type="checkbox"
              checked={fields.isActive}
              onChange={(e) => set('isActive')(e.target.checked)}
            />
            Active (shoppers can use it within its dates)
          </label>
        )}
      </div>
      <div className="row">
        <button type="submit" disabled={action.pending}>
          {coupon ? 'Save coupon' : 'Create coupon'}
        </button>
      </div>
    </form>
  );
}

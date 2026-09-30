/**
 * Money is NEVER a JS float (DEC-05). Amounts are Decimal values in major units
 * (PKR) with exactly two decimal places, rounded half-up.
 */
import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/** Type alias: an amount in major units (PKR). */
export type Money = Decimal;

export const MONEY_ZERO: Money = new Decimal(0);
export const MONEY_PRECISION = 2;

/** Normalize any input to a validated 2-dp Money value. Throws on non-finite/negative. */
export function money(value: Decimal.Value): Money {
  const d = new Decimal(value);
  if (!d.isFinite()) throw new Error(`money(): non-finite value ${String(value)}`);
  const n = d.toDecimalPlaces(MONEY_PRECISION, Decimal.ROUND_HALF_UP);
  return n;
}

/** assertMoney requires a non-negative, finite amount. */
export function assertMoney(value: Decimal.Value, label = 'amount'): Money {
  const n = money(value);
  if (n.isNegative()) throw new Error(`${label} must not be negative (got ${n.toFixed()})`);
  return n;
}

export const add = (a: Decimal.Value, b: Decimal.Value): Money => money(new Decimal(a).plus(new Decimal(b)));
export const sub = (a: Decimal.Value, b: Decimal.Value): Money => money(new Decimal(a).minus(new Decimal(b)));
export const mul = (a: Decimal.Value, b: Decimal.Value): Money => money(new Decimal(a).times(new Decimal(b)));
export const div = (a: Decimal.Value, b: Decimal.Value): Money => {
  if (new Decimal(b).isZero()) throw new Error('div(): division by zero');
  return money(new Decimal(a).div(new Decimal(b)));
};

/** Apply a percentage (e.g. 17 for 17%). */
export function percent(value: Decimal.Value, percentValue: Decimal.Value): Money {
  return money(new Decimal(value).times(new Decimal(percentValue)).div(100));
}

export const isZero = (a: Decimal.Value): boolean => new Decimal(a).isZero();
export const isPositive = (a: Decimal.Value): boolean => new Decimal(a).isPositive();
export const isNegative = (a: Decimal.Value): boolean => new Decimal(a).isNegative();

/** Convert to integer minor units (paisa). e.g. 1234.56 -> 123456 */
export function toPaisa(value: Decimal.Value): bigint {
  return BigInt(money(value).mul(100).toFixed(0, Decimal.ROUND_HALF_UP));
}

/** Convert back from integer minor units to Money. */
export function fromPaisa(paisa: bigint | number): Money {
  return money(new Decimal(paisa.toString()).div(100));
}

/** Format as PKR with South-Asian (lakh) digit grouping, e.g. "Rs 1,23,456.78". */
export function formatPKR(value: Decimal.Value): string {
  const n = money(value);
  const [intPart, fracPart = '00'] = n.toFixed(MONEY_PRECISION).split('.');
  const int = intPart!;
  const last3 = int.length > 3 ? int.slice(-3) : int;
  const rest = int.length > 3 ? int.slice(0, -3) : '';
  const groupedRest = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '';
  return `Rs ${groupedRest}${last3}.${fracPart}`;
}

/**
 * Strict exact-arithmetic sum of an array of amounts.
 * @throws if any element is missing.
 */
export function sum(values: readonly Decimal.Value[]): Money {
  if (values.length === 0) return MONEY_ZERO;
  let acc = new Decimal(0);
  for (const v of values) {
    if (v === undefined || v === null) throw new Error('sum(): missing element');
    acc = acc.plus(v);
  }
  return money(acc);
}
/**
 * Date inputs in the console are Pakistan wall time, whatever the browser's or
 * the server's zone: that is what lib/format.ts displays, and it keeps a form
 * rendered on the server identical to the one the browser hydrates. Pakistan has
 * no daylight saving, so a fixed +05:00 offset is exact.
 */
const OFFSET_MS = 5 * 3_600_000;
const OFFSET = '+05:00';

/** ISO instant → `YYYY-MM-DDTHH:mm` for `<input type="datetime-local">`. */
export function toKarachiInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 16);
}

/** `<input type="datetime-local">` value → ISO instant, or undefined when blank or malformed. */
export function fromKarachiInput(value: string | null | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return undefined;
  const date = new Date(`${value.length === 16 ? `${value}:00` : value}${OFFSET}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Today's date in Pakistan, `YYYY-MM-DD`, shifted by whole days. */
export function karachiDay(offsetDays = 0): string {
  return new Date(Date.now() + OFFSET_MS + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** First and last second of a Pakistan calendar day, as ISO instants. */
export function dayStart(day: string | undefined): string | undefined {
  return day && DAY.test(day) ? new Date(`${day}T00:00:00${OFFSET}`).toISOString() : undefined;
}

export function dayEnd(day: string | undefined): string | undefined {
  return day && DAY.test(day) ? new Date(`${day}T23:59:59${OFFSET}`).toISOString() : undefined;
}

import { invalidInput } from '@fakhri/shared';

/**
 * Pakistani mobile numbers, stored in one canonical form: `+923XXXXXXXXX`.
 * Accepts the shapes customers actually type (`0300 1234567`, `+92 300 …`,
 * `0092…`, `92…`). Pure, so it is unit tested directly.
 */
export function normalizePhone(raw: string): string {
  const digitsOnly = raw.replace(/[\s()\-.]/g, '');
  let national: string;

  if (digitsOnly.startsWith('+92')) national = digitsOnly.slice(3);
  else if (digitsOnly.startsWith('0092')) national = digitsOnly.slice(4);
  else if (digitsOnly.startsWith('92') && digitsOnly.length === 12) national = digitsOnly.slice(2);
  else if (digitsOnly.startsWith('0')) national = digitsOnly.slice(1);
  else national = digitsOnly;

  if (!/^3\d{9}$/.test(national)) {
    throw invalidInput('Enter a Pakistani mobile number, for example 03001234567');
  }
  return `+92${national}`;
}

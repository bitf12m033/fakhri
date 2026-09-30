import { describe, expect, it } from 'vitest';
import { AppError } from '@fakhri/shared';
import { assertPasswordPolicy } from '../src/modules/auth/password.service';
import { normalizePhone } from '../src/modules/customers/phone';

/** Password policy and phone normalization (increment 3.4). No database needed. */

function code(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : 'NOT_APP_ERROR';
  }
  return 'NO_ERROR';
}

describe('assertPasswordPolicy', () => {
  it('accepts a password with a letter, a digit and enough length', () => {
    expect(code(() => assertPasswordPolicy('karachi2026'))).toBe('NO_ERROR');
  });

  it('rejects short, one-class, over-long and common passwords (REQ-12)', () => {
    expect(code(() => assertPasswordPolicy('short1'))).toBe('INVALID_INPUT');
    expect(code(() => assertPasswordPolicy('alllettershere'))).toBe('INVALID_INPUT');
    expect(code(() => assertPasswordPolicy('1234567890'))).toBe('INVALID_INPUT');
    expect(code(() => assertPasswordPolicy(`a1${'x'.repeat(199)}`))).toBe('INVALID_INPUT');
    expect(code(() => assertPasswordPolicy('password123'))).toBe('INVALID_INPUT');
    expect(code(() => assertPasswordPolicy('Password123'))).toBe('INVALID_INPUT');
  });
});

describe('normalizePhone', () => {
  it('canonicalizes every shape a customer might type', () => {
    for (const input of [
      '03001234567',
      '+923001234567',
      '00923001234567',
      '923001234567',
      '0300 123 4567',
      '0300-123-4567',
      '(0300) 1234567',
    ]) {
      expect(normalizePhone(input), input).toBe('+923001234567');
    }
  });

  it('rejects anything that is not a Pakistani mobile number', () => {
    for (const input of ['0211234567', '0300123456', '030012345678', '+911234567890', 'not-a-number', '']) {
      expect(code(() => normalizePhone(input)), input).toBe('INVALID_INPUT');
    }
  });
});

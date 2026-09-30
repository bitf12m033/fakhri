import { describe, expect, it } from 'vitest';
import { add, assertMoney, div, formatPKR, fromPaisa, money, mul, percent, sub, sum, toPaisa } from '../src/index';

describe('money (DEC-05: exact decimal, no floats)', () => {
  it('normalizes to 2dp half-up', () => {
    expect(money('1.005').toFixed(2)).toBe('1.01');
    expect(money('1.004').toFixed(2)).toBe('1.00');
    expect(money(10).toFixed(2)).toBe('10.00');
  });

  it('rejects non-finite and negative money', () => {
    expect(() => money('NaN')).toThrow();
    expect(() => money('Infinity')).toThrow();
    expect(() => assertMoney('-1')).toThrow();
  });

  it('add/sub/mul/div keep exactness', () => {
    expect(add('0.1', '0.2').toFixed(2)).toBe('0.30');
    expect(sub('10', '0.01').toFixed(2)).toBe('9.99');
    expect(mul('1.5', '2').toFixed(2)).toBe('3.00');
    expect(div('3', '4').toFixed(2)).toBe('0.75');
    expect(() => div('1', '0')).toThrow();
  });

  it('percent and sum', () => {
    expect(percent('1000', '17').toFixed(2)).toBe('170.00');
    expect(sum(['1.10', '2.20', '3.30']).toFixed(2)).toBe('6.60');
    expect(sum([]).toFixed(2)).toBe('0.00');
  });

  it('paisa conversion round-trips', () => {
    expect(toPaisa('1234.56')).toBe(123456n);
    expect(toPaisa('0.1')).toBe(10n);
    expect(fromPaisa(123456n).toFixed(2)).toBe('1234.56');
  });

  it('formats like PKR with paisa', () => {
    expect(formatPKR('123456.78')).toBe('Rs 1,23,456.78');
    expect(formatPKR('0')).toBe('Rs 0.00');
  });
});
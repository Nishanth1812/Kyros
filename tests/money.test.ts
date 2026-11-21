import { describe, expect, test } from 'bun:test';
import { formatMinorUnits, parseAmountToMinorUnits } from '../src/lib/money';
import { MAX_AMOUNT_MINOR_UNITS } from '../src/storage';

describe('money', () => {
  describe('parseAmountToMinorUnits - normal INR amounts', () => {
    test('parses whole rupee amounts', () => {
      expect(parseAmountToMinorUnits('125')).toEqual({ ok: true, amountMinor: 12500 });
      expect(parseAmountToMinorUnits('1')).toEqual({ ok: true, amountMinor: 100 });
      expect(parseAmountToMinorUnits('0001')).toEqual({ ok: true, amountMinor: 100 });
    });

    test('parses rupees with one or two decimal places (paise)', () => {
      expect(parseAmountToMinorUnits('125.5')).toEqual({ ok: true, amountMinor: 12550 });
      expect(parseAmountToMinorUnits('125.50')).toEqual({ ok: true, amountMinor: 12550 });
      expect(parseAmountToMinorUnits('125.05')).toEqual({ ok: true, amountMinor: 12505 });
      expect(parseAmountToMinorUnits('0.01')).toEqual({ ok: true, amountMinor: 1 });
      expect(parseAmountToMinorUnits('0.10')).toEqual({ ok: true, amountMinor: 10 });
      expect(parseAmountToMinorUnits('0.99')).toEqual({ ok: true, amountMinor: 99 });
    });

    test('accepts common display characters (₹, commas, spaces)', () => {
      expect(parseAmountToMinorUnits('₹99.99')).toEqual({ ok: true, amountMinor: 9999 });
      expect(parseAmountToMinorUnits('1,234.56')).toEqual({ ok: true, amountMinor: 123456 });
      expect(parseAmountToMinorUnits('₹1,23,456.78')).toEqual({ ok: true, amountMinor: 12345678 });
      expect(parseAmountToMinorUnits('  50  ')).toEqual({ ok: true, amountMinor: 5000 });
    });
  });

  describe('parseAmountToMinorUnits - invalid/malformed input', () => {
    test('rejects empty or missing amount', () => {
      expect(parseAmountToMinorUnits('')).toEqual({ ok: false, error: 'Amount is required.' });
      expect(parseAmountToMinorUnits('   ')).toEqual({ ok: false, error: 'Amount is required.' });
      expect(parseAmountToMinorUnits('₹')).toEqual({ ok: false, error: 'Amount is required.' });
      expect(parseAmountToMinorUnits(',')).toEqual({ ok: false, error: 'Amount is required.' });
    });

    test('rejects zero amounts', () => {
      expect(parseAmountToMinorUnits('0')).toEqual({ ok: false, error: 'Amount must be greater than zero.' });
      expect(parseAmountToMinorUnits('0.0')).toEqual({ ok: false, error: 'Amount must be greater than zero.' });
      expect(parseAmountToMinorUnits('0.00')).toEqual({ ok: false, error: 'Amount must be greater than zero.' });
      expect(parseAmountToMinorUnits('000')).toEqual({ ok: false, error: 'Amount must be greater than zero.' });
    });

    test('rejects negative amounts', () => {
      expect(parseAmountToMinorUnits('-1')).toEqual({ ok: false, error: 'Amount cannot be negative.' });
      expect(parseAmountToMinorUnits('-0.01')).toEqual({ ok: false, error: 'Amount cannot be negative.' });
      expect(parseAmountToMinorUnits('-125.50')).toEqual({ ok: false, error: 'Amount cannot be negative.' });
    });

    test('rejects malformed numeric formats', () => {
      const malformed = [
        'abc',
        '12abc',
        '12.345',
        '12.3.4',
        '10.',
        '.5',
        '.50',
        '1e3',
        'Infinity',
        'NaN',
        '+5',
        '1-2',
        '1,,2',
        '1 234',
      ];
      for (const raw of malformed) {
        const result = parseAmountToMinorUnits(raw);
        expect(result).toEqual({ ok: false, error: 'Enter a valid amount, e.g. 125 or 125.50.' });
      }
    });
  });

  describe('parseAmountToMinorUnits - maximum safe minor-unit edge cases', () => {
    test('accepts the maximum safe integer amount in minor units', () => {
      // MAX_AMOUNT_MINOR_UNITS paise = 90071992547409.91 rupees
      expect(parseAmountToMinorUnits('90071992547409.91')).toEqual({
        ok: true,
        amountMinor: MAX_AMOUNT_MINOR_UNITS,
      });
      expect(parseAmountToMinorUnits('9,00,71,99,25,47,409.91')).toEqual({
        ok: true,
        amountMinor: MAX_AMOUNT_MINOR_UNITS,
      });
    });

    test('rejects amounts exceeding the maximum safe integer', () => {
      expect(parseAmountToMinorUnits('90071992547409.92')).toEqual({
        ok: false,
        error: 'Amount is too large.',
      });
      expect(parseAmountToMinorUnits('90071992547410.00')).toEqual({
        ok: false,
        error: 'Amount is too large.',
      });
      expect(parseAmountToMinorUnits('99999999999999.99')).toEqual({
        ok: false,
        error: 'Amount is too large.',
      });
    });
  });

  describe('formatMinorUnits - normal INR amounts', () => {
    test('formats paise as INR with two decimal places', () => {
      expect(formatMinorUnits(0)).toBe('₹0.00');
      expect(formatMinorUnits(1)).toBe('₹0.01');
      expect(formatMinorUnits(10)).toBe('₹0.10');
      expect(formatMinorUnits(99)).toBe('₹0.99');
      expect(formatMinorUnits(100)).toBe('₹1.00');
      expect(formatMinorUnits(101)).toBe('₹1.01');
      expect(formatMinorUnits(12345)).toBe('₹123.45');
      expect(formatMinorUnits(12550)).toBe('₹125.50');
    });

    test('formats large amounts with Indian digit grouping', () => {
      expect(formatMinorUnits(123456789)).toBe('₹12,34,567.89');
      expect(formatMinorUnits(10000000)).toBe('₹1,00,000.00');
      expect(formatMinorUnits(100000000)).toBe('₹10,00,000.00');
    });
  });

  describe('formatMinorUnits - maximum safe minor-unit edge cases and exact paise', () => {
    test('formats the maximum safe integer without losing a paise', () => {
      expect(formatMinorUnits(MAX_AMOUNT_MINOR_UNITS)).toBe('₹9,00,71,99,25,47,409.91');
    });

    test('formats values adjacent to the maximum safe integer exactly', () => {
      expect(formatMinorUnits(MAX_AMOUNT_MINOR_UNITS - 1)).toBe('₹9,00,71,99,25,47,409.90');
      expect(formatMinorUnits(MAX_AMOUNT_MINOR_UNITS - 2)).toBe('₹9,00,71,99,25,47,409.89');
      expect(formatMinorUnits(MAX_AMOUNT_MINOR_UNITS - 91)).toBe('₹9,00,71,99,25,47,409.00');
      expect(formatMinorUnits(MAX_AMOUNT_MINOR_UNITS - 92)).toBe('₹9,00,71,99,25,47,408.99');
    });

    test('preserves exact paise for other large values', () => {
      // Values where float division by 100 can distort exact cents.
      expect(formatMinorUnits(9007199254740990)).toBe('₹9,00,71,99,25,47,409.90');
      expect(formatMinorUnits(1000000000000001)).toBe('₹1,00,00,00,00,00,000.01');
    });
  });
});

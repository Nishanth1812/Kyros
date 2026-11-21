import { MAX_AMOUNT_MINOR_UNITS } from '../storage';

/**
 * Kyros 0.1 supports a single currency: INR.
 * Minor units are paise (1 rupee = 100 paise), matching the integer-only
 * amount stored by the storage layer. No conversion is performed.
 */
export const CURRENCY = {
  code: 'INR',
  locale: 'en-IN',
  symbol: '₹',
  minorUnitDigits: 2,
} as const;

const wholeRupeeFormatter = new Intl.NumberFormat(CURRENCY.locale, {
  style: 'currency',
  currency: CURRENCY.code,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Format an integer number of paise as an INR amount, e.g. 12345 -> ₹123.45. */
export function formatMinorUnits(amountMinor: number): string {
  const sign = amountMinor < 0 ? -1 : 1;
  const absMinor = Math.abs(amountMinor);
  const paise = absMinor % 100;
  const wholeRupees = (absMinor - paise) / 100;

  const formattedWhole = wholeRupeeFormatter.format(sign * wholeRupees);
  return `${formattedWhole}.${String(paise).padStart(2, '0')}`;
}

export type AmountParseResult =
  | { ok: true; amountMinor: number }
  | { ok: false; error: string };

/**
 * Parse a user-entered rupee string into integer paise. We never hand a
 * floating-point or string amount to the storage layer: only whole minor
 * units, so money arithmetic stays exact.
 */
export function parseAmountToMinorUnits(raw: string): AmountParseResult {
  const input = raw.trim().replace(/^₹\s*/, '');
  const cleaned = input.replace(/,/g, '');

  if (cleaned === '') return { ok: false, error: 'Amount is required.' };
  if (cleaned.startsWith('-')) {
    return { ok: false, error: 'Amount cannot be negative.' };
  }
  if (!/^(?:\d+|\d{1,3}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(input)) {
    return { ok: false, error: 'Enter a valid amount, e.g. 125 or 125.50.' };
  }

  const [whole, fraction = ''] = cleaned.split('.');
  const paise = Number(`${fraction}00`.slice(0, 2));
  const amountMinor = Number(whole) * 100 + paise;

  if (!Number.isSafeInteger(amountMinor) || amountMinor > MAX_AMOUNT_MINOR_UNITS) {
    return { ok: false, error: 'Amount is too large.' };
  }
  if (amountMinor === 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }
  return { ok: true, amountMinor };
}

export type AmountFeedback = { amountMinor?: string };

/**
 * Reconcile a displayed amount error after the user edits the amount text.
 * Uses the same parser as submission, so feedback always matches what would
 * actually be saved. Only refreshes an error that is already visible (i.e.
 * after a submit attempt); other field/form errors are left untouched.
 */
export function refreshAmountError<E extends AmountFeedback>(
  errors: E,
  raw: string
): E {
  if (!errors.amountMinor) return errors;

  const parsed = parseAmountToMinorUnits(raw);
  if (!parsed.ok) return { ...errors, amountMinor: parsed.error };

  const next = { ...errors };
  delete next.amountMinor;
  return next;
}

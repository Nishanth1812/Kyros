import {
  CategoryValidationError,
  CategoryValidationErrorEntry,
  CategoryValidationResult,
  NewCategoryInput,
  NewTransactionInput,
  TransactionType,
  ValidatedNewTransaction,
  ValidationError,
  ValidationResult,
  TransactionValidationError,
} from './types';

export const MAX_AMOUNT_MINOR_UNITS = Number.MAX_SAFE_INTEGER;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isValidCalendarDate(date: string): boolean {
  if (!ISO_DATE_RE.test(date)) return false;
  const [yStr, mStr, dStr] = date.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  );
}

export function validateTransactionInput(
  input: NewTransactionInput
): ValidationResult {
  const errors: ValidationError[] = [];

  // Type
  let type: TransactionType | undefined;
  if (input.type === undefined || input.type === null || input.type === '') {
    errors.push({ field: 'type', message: 'Type is required.' });
  } else if (input.type === 'income' || input.type === 'expense') {
    type = input.type;
  } else {
    errors.push({
      field: 'type',
      message: 'Type must be either "income" or "expense".',
    });
  }

  // Amount (integer minor units)
  let amountMinor: number | undefined;
  const amount = input.amountMinor;
  if (amount === undefined || amount === null || amount === '') {
    errors.push({ field: 'amountMinor', message: 'Amount is required.' });
  } else if (typeof amount === 'string') {
    // Reject string amounts to avoid ambiguous parsing; callers must supply integer minor units.
    errors.push({
      field: 'amountMinor',
      message: 'Amount must be an integer number of minor units.',
    });
  } else if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    errors.push({
      field: 'amountMinor',
      message: 'Amount must be a valid integer number of minor units.',
    });
  } else if (!Number.isInteger(amount)) {
    errors.push({
      field: 'amountMinor',
      message: 'Amount must be an integer number of minor units (no decimals).',
    });
  } else if (amount === 0) {
    errors.push({ field: 'amountMinor', message: 'Amount must be greater than zero.' });
  } else if (amount < 0) {
    errors.push({ field: 'amountMinor', message: 'Amount must not be negative.' });
  } else if (amount > MAX_AMOUNT_MINOR_UNITS) {
    errors.push({
      field: 'amountMinor',
      message: 'Amount is excessively large.',
    });
  } else {
    amountMinor = amount;
  }

  // Date
  let date: string | undefined;
  if (input.date === undefined || input.date === null || input.date === '') {
    errors.push({ field: 'date', message: 'Date is required.' });
  } else if (typeof input.date !== 'string') {
    errors.push({ field: 'date', message: 'Date must be a string in YYYY-MM-DD format.' });
  } else if (!isValidCalendarDate(input.date)) {
    errors.push({
      field: 'date',
      message: 'Date must be a valid calendar date in YYYY-MM-DD format.',
    });
  } else {
    date = input.date;
  }

  // Description (optional)
  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== 'string') {
      errors.push({ field: 'description', message: 'Description must be a string.' });
    } else {
      const trimmed = input.description.trim();
      description = trimmed.length > 0 ? trimmed : null;
    }
  }

  if (errors.length > 0 || !type || amountMinor === undefined || !date) {
    return { ok: false, errors };
  }

  const value: ValidatedNewTransaction = {
    type,
    amountMinor,
    date,
    description,
  };

  return { ok: true, errors: [], value };
}

export function assertValidTransactionInput(
  input: NewTransactionInput
): ValidatedNewTransaction {
  const result = validateTransactionInput(input);
  if (!result.ok || !result.value) {
    throw new TransactionValidationError(result.errors);
  }
  return result.value;
}

/**
 * Validate the raw category id supplied with a transaction write. Existence
 * and type agreement are checked at the storage boundary because they require
 * a database lookup; this helper only enforces the shape of the value.
 */
export function assertValidCategoryId(value: unknown): number {
  if (!isInteger(value) || value <= 0) {
    throw new TransactionValidationError([
      {
        field: 'categoryId',
        message: 'Category is required and must be a positive integer.',
      },
    ]);
  }
  return value;
}

/** Validate and normalize a new category name (trimmed, non-blank). */
export function validateCategoryInput(
  input: NewCategoryInput
): CategoryValidationResult {
  const errors: CategoryValidationErrorEntry[] = [];

  let type: TransactionType | undefined;
  if (input?.type === 'income' || input?.type === 'expense') {
    type = input.type;
  } else {
    errors.push({
      field: 'type',
      message: 'Type must be either "income" or "expense".',
    });
  }

  let name: string | undefined;
  if (typeof input?.name !== 'string') {
    errors.push({ field: 'name', message: 'Name is required.' });
  } else {
    const trimmed = input.name.trim();
    if (trimmed.length === 0) {
      errors.push({ field: 'name', message: 'Name is required.' });
    } else {
      name = trimmed;
    }
  }

  if (errors.length > 0 || !type || name === undefined) {
    return { ok: false, errors };
  }

  return { ok: true, errors: [], value: { type, name } };
}

export function assertValidCategoryInput(input: NewCategoryInput): NewCategoryInput {
  const result = validateCategoryInput(input);
  if (!result.ok || !result.value) {
    throw new CategoryValidationError(result.errors);
  }
  return result.value;
}

import {
  BackupBudget,
  BackupCategory,
  BackupTransaction,
  BackupValidationError,
  KyrosBackupV1,
  TransactionType,
} from './types';
import { MAX_AMOUNT_MINOR_UNITS } from './validation';

const DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

function isValidIsoDate(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || !DATE_REGEX.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function validateBackupPayload(raw: unknown): KyrosBackupV1 {
  let parsed: any = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new BackupValidationError('Invalid backup file: not valid JSON.');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BackupValidationError('Invalid backup format: root must be an object.');
  }

  if (!parsed.meta || typeof parsed.meta !== 'object') {
    throw new BackupValidationError('Invalid backup format: Missing backup metadata.');
  }

  if (parsed.meta.version !== 1) {
    throw new BackupValidationError(
      `Unsupported backup version: ${parsed.meta.version}. Only version 1 is supported.`
    );
  }

  if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    throw new BackupValidationError('Invalid backup format: Missing backup data.');
  }

  const { categories, transactions, budgets } = parsed.data;

  if (!Array.isArray(categories)) {
    throw new BackupValidationError('Invalid backup data: categories must be an array.');
  }
  if (!Array.isArray(transactions)) {
    throw new BackupValidationError('Invalid backup data: transactions must be an array.');
  }
  if (!Array.isArray(budgets)) {
    throw new BackupValidationError('Invalid backup data: budgets must be an array.');
  }

  // Validate Categories
  const categoryMap = new Map<number, BackupCategory>();
  const validatedCategories: BackupCategory[] = [];

  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    if (!cat || typeof cat !== 'object') {
      throw new BackupValidationError(`Category at index ${i} is not an object.`);
    }
    const { id, type, name, isBuiltin } = cat;

    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new BackupValidationError(`Category at index ${i} has an invalid id.`);
    }
    if (categoryMap.has(id)) {
      throw new BackupValidationError(`Duplicate category id ${id}.`);
    }
    if (type !== 'income' && type !== 'expense') {
      throw new BackupValidationError(
        `Category "${name ?? id}" has invalid category type "${type}". Must be 'income' or 'expense'.`
      );
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new BackupValidationError(`Category ${id} has an invalid or empty category name.`);
    }
    const cleanCat: BackupCategory = {
      id,
      type: type as TransactionType,
      name: name.trim(),
      isBuiltin: Boolean(isBuiltin),
    };
    categoryMap.set(id, cleanCat);
    validatedCategories.push(cleanCat);
  }

  // Validate Transactions
  const validatedTransactions: BackupTransaction[] = [];
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (!tx || typeof tx !== 'object') {
      throw new BackupValidationError(`Transaction at index ${i} is not an object.`);
    }
    const { id, type, amountMinor, date, description, createdAt, categoryId } = tx;

    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new BackupValidationError(`Transaction at index ${i} has an invalid id.`);
    }
    if (type !== 'income' && type !== 'expense') {
      throw new BackupValidationError(
        `Transaction ${id} has invalid type "${type}". Must be 'income' or 'expense'.`
      );
    }
    if (
      typeof amountMinor !== 'number' ||
      !Number.isInteger(amountMinor) ||
      amountMinor <= 0 ||
      amountMinor > MAX_AMOUNT_MINOR_UNITS
    ) {
      throw new BackupValidationError(
        `Transaction ${id} has an invalid amountMinor. Must be a positive integer minor units up to ${MAX_AMOUNT_MINOR_UNITS}.`
      );
    }
    if (!isValidIsoDate(date)) {
      throw new BackupValidationError(
        `Transaction ${id} date "${date}" must be a valid ISO 8601 calendar date (YYYY-MM-DD).`
      );
    }
    if (description !== null && description !== undefined && typeof description !== 'string') {
      throw new BackupValidationError(`Transaction ${id} description must be a string or null.`);
    }
    if (typeof createdAt !== 'number' || !Number.isInteger(createdAt) || createdAt <= 0) {
      throw new BackupValidationError(`Transaction ${id} createdAt must be a valid timestamp.`);
    }
    if (typeof categoryId !== 'number' || !Number.isInteger(categoryId) || categoryId <= 0) {
      throw new BackupValidationError(`Transaction ${id} has an invalid categoryId.`);
    }

    const cat = categoryMap.get(categoryId);
    if (!cat) {
      throw new BackupValidationError(
        `Transaction ${id} references missing category with id ${categoryId}.`
      );
    }
    if (cat.type !== type) {
      throw new BackupValidationError(
        `Transaction ${id} type "${type}" does not match category type "${cat.type}".`
      );
    }

    validatedTransactions.push({
      id,
      type: type as TransactionType,
      amountMinor,
      date,
      description: typeof description === 'string' && description.trim().length > 0 ? description.trim() : null,
      createdAt,
      categoryId,
    });
  }

  // Validate Budgets
  const validatedBudgets: BackupBudget[] = [];
  let hasOverallBudget = false;
  const configuredCategoryBudgets = new Set<number>();

  for (let i = 0; i < budgets.length; i++) {
    const b = budgets[i];
    if (!b || typeof b !== 'object') {
      throw new BackupValidationError(`Budget at index ${i} is not an object.`);
    }
    const { id, categoryId, amountMinor } = b;

    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new BackupValidationError(`Budget at index ${i} has an invalid id.`);
    }
    if (
      typeof amountMinor !== 'number' ||
      !Number.isInteger(amountMinor) ||
      amountMinor <= 0 ||
      amountMinor > MAX_AMOUNT_MINOR_UNITS
    ) {
      throw new BackupValidationError(
        `Budget ${id} has an invalid amountMinor. Must be positive integer paise.`
      );
    }

    if (categoryId === null || categoryId === undefined) {
      if (hasOverallBudget) {
        throw new BackupValidationError('Duplicate overall budget in backup file.');
      }
      hasOverallBudget = true;
      validatedBudgets.push({ id, categoryId: null, amountMinor });
    } else {
      if (typeof categoryId !== 'number' || !Number.isInteger(categoryId) || categoryId <= 0) {
        throw new BackupValidationError(`Budget ${id} has invalid categoryId.`);
      }
      const cat = categoryMap.get(categoryId);
      if (!cat) {
        throw new BackupValidationError(`Budget ${id} references missing category with id ${categoryId}.`);
      }
      if (cat.type !== 'expense') {
        throw new BackupValidationError(`Budget ${id} references income category "${cat.name}". Only expense categories can have budgets.`);
      }
      if (configuredCategoryBudgets.has(categoryId)) {
        throw new BackupValidationError(`Duplicate budget for category id ${categoryId} in backup file.`);
      }
      configuredCategoryBudgets.add(categoryId);
      validatedBudgets.push({ id, categoryId, amountMinor });
    }
  }

  return {
    meta: {
      version: 1,
      appVersion: String(parsed.meta.appVersion ?? '0.4.0'),
      exportedAt: String(parsed.meta.exportedAt ?? new Date().toISOString()),
    },
    data: {
      categories: validatedCategories,
      transactions: validatedTransactions,
      budgets: validatedBudgets,
    },
  };
}

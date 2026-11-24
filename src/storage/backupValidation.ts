import {
  BackupBudgetV2,
  BackupCategoryV2,
  BackupGoal,
  BackupRecurring,
  BackupTombstone,
  BackupTransactionV2,
  BackupValidationError,
  KyrosBackupV2,
  RecurringFrequency,
  TombstoneEntityType,
  TransactionType,
} from './types';
import { MAX_AMOUNT_MINOR_UNITS } from './validation';

const DATE_REGEX = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const FREQUENCIES: ReadonlyArray<RecurringFrequency> = ['daily', 'weekly', 'monthly', 'yearly'];
const TOMBSTONE_TYPES: ReadonlyArray<TombstoneEntityType> = [
  'transaction',
  'category',
  'budget',
  'recurring',
  'goal',
];
const GOAL_STATUSES = ['active', 'completed', 'cancelled'] as const;

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

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Accept a Kyros 0.4/0.5 (`KyrosBackupV1`) or Kyros 0.6 (`KyrosBackupV2`)
 * backup and normalize it to V2. Missing V2 fields are seeded exactly as the
 * restore path expects: `isArchived = false`, `updatedAt = createdAt` for
 * transactions (0 for rows that never carried a timestamp), and empty
 * recurring/goals/tombstones lists.
 */
export function validateBackupPayload(raw: unknown): KyrosBackupV2 {
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

  if (parsed.meta.version !== 1 && parsed.meta.version !== 2) {
    throw new BackupValidationError(
      `Unsupported backup version: ${parsed.meta.version}. Only versions 1 and 2 are supported.`
    );
  }

  if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    throw new BackupValidationError('Invalid backup format: Missing backup data.');
  }

  const { categories, transactions, budgets } = parsed.data;
  const goals = parsed.data.goals ?? [];
  const recurring = parsed.data.recurring ?? [];
  const tombstones = parsed.data.tombstones ?? [];

  if (!Array.isArray(categories)) {
    throw new BackupValidationError('Invalid backup data: categories must be an array.');
  }
  if (!Array.isArray(transactions)) {
    throw new BackupValidationError('Invalid backup data: transactions must be an array.');
  }
  if (!Array.isArray(budgets)) {
    throw new BackupValidationError('Invalid backup data: budgets must be an array.');
  }
  if (!Array.isArray(recurring)) {
    throw new BackupValidationError('Invalid backup data: recurring must be an array.');
  }
  if (!Array.isArray(goals)) {
    throw new BackupValidationError('Invalid backup data: goals must be an array.');
  }
  if (!Array.isArray(tombstones)) {
    throw new BackupValidationError('Invalid backup data: tombstones must be an array.');
  }

  // Validate Categories
  const categoryMap = new Map<number, BackupCategoryV2>();
  const validatedCategories: BackupCategoryV2[] = [];

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
    const cleanCat: BackupCategoryV2 = {
      id,
      type: type as TransactionType,
      name: name.trim(),
      isBuiltin: Boolean(isBuiltin),
      isArchived: Boolean(cat.isArchived),
      updatedAt: isNonNegativeInt(cat.updatedAt) ? cat.updatedAt : 0,
    };
    categoryMap.set(id, cleanCat);
    validatedCategories.push(cleanCat);
  }

  // Validate Transactions
  const validatedTransactions: BackupTransactionV2[] = [];
  const transactionIds = new Set<number>();
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (!tx || typeof tx !== 'object') {
      throw new BackupValidationError(`Transaction at index ${i} is not an object.`);
    }
    const { id, type, amountMinor, date, description, createdAt, categoryId } = tx;

    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new BackupValidationError(`Transaction at index ${i} has an invalid id.`);
    }
    if (transactionIds.has(id)) {
      throw new BackupValidationError(`Duplicate transaction id ${id}.`);
    }
    transactionIds.add(id);
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
      // Legacy files have no updatedAt: a row's creation is its last change.
      updatedAt: isNonNegativeInt(tx.updatedAt) ? tx.updatedAt : createdAt,
    });
  }

  // Validate Budgets
  const validatedBudgets: BackupBudgetV2[] = [];
  let hasOverallBudget = false;
  const configuredCategoryBudgets = new Set<number>();
  const budgetIds = new Set<number>();

  for (let i = 0; i < budgets.length; i++) {
    const b = budgets[i];
    if (!b || typeof b !== 'object') {
      throw new BackupValidationError(`Budget at index ${i} is not an object.`);
    }
    const { id, categoryId, amountMinor } = b;

    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      throw new BackupValidationError(`Budget at index ${i} has an invalid id.`);
    }
    if (budgetIds.has(id)) {
      throw new BackupValidationError(`Duplicate budget id ${id}.`);
    }
    budgetIds.add(id);
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
    const updatedAt = isNonNegativeInt(b.updatedAt) ? b.updatedAt : 0;

    if (categoryId === null || categoryId === undefined) {
      if (hasOverallBudget) {
        throw new BackupValidationError('Duplicate overall budget in backup file.');
      }
      hasOverallBudget = true;
      validatedBudgets.push({ id, categoryId: null, amountMinor, updatedAt });
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
      validatedBudgets.push({ id, categoryId, amountMinor, updatedAt });
    }
  }

  // Validate Recurring Transactions
  const validatedRecurring: BackupRecurring[] = [];
  const recurringIds = new Set<number>();
  for (let i = 0; i < recurring.length; i++) {
    const rec = recurring[i];
    if (!rec || typeof rec !== 'object') {
      throw new BackupValidationError(`Recurring transaction at index ${i} is not an object.`);
    }
    const { id, amountMinor, type, categoryId, description, frequency, nextDueDate, isActive } = rec;

    if (!isPositiveInt(id)) {
      throw new BackupValidationError(`Recurring transaction at index ${i} has an invalid id.`);
    }
    if (recurringIds.has(id)) {
      throw new BackupValidationError(`Duplicate recurring transaction id ${id}.`);
    }
    recurringIds.add(id);
    if (
      typeof amountMinor !== 'number' ||
      !Number.isInteger(amountMinor) ||
      amountMinor <= 0 ||
      amountMinor > MAX_AMOUNT_MINOR_UNITS
    ) {
      throw new BackupValidationError(
        `Recurring transaction ${id} has an invalid amountMinor. Must be positive integer paise.`
      );
    }
    if (type !== 'income' && type !== 'expense') {
      throw new BackupValidationError(
        `Recurring transaction ${id} has invalid type "${type}". Must be 'income' or 'expense'.`
      );
    }
    if (!isPositiveInt(categoryId)) {
      throw new BackupValidationError(`Recurring transaction ${id} has an invalid categoryId.`);
    }
    const cat = categoryMap.get(categoryId);
    if (!cat) {
      throw new BackupValidationError(
        `Recurring transaction ${id} references missing category with id ${categoryId}.`
      );
    }
    if (cat.type !== type) {
      throw new BackupValidationError(
        `Recurring transaction ${id} type "${type}" does not match category type "${cat.type}".`
      );
    }
    if (!FREQUENCIES.includes(frequency)) {
      throw new BackupValidationError(`Recurring transaction ${id} has invalid frequency "${frequency}".`);
    }
    if (!isValidIsoDate(nextDueDate)) {
      throw new BackupValidationError(
        `Recurring transaction ${id} nextDueDate "${nextDueDate}" must be a valid ISO 8601 calendar date.`
      );
    }
    if (description !== null && description !== undefined && typeof description !== 'string') {
      throw new BackupValidationError(
        `Recurring transaction ${id} description must be a string or null.`
      );
    }
    if (!isPositiveInt(rec.createdAt)) {
      throw new BackupValidationError(`Recurring transaction ${id} createdAt must be a valid timestamp.`);
    }

    validatedRecurring.push({
      id,
      amountMinor,
      type: type as TransactionType,
      categoryId,
      description:
        typeof description === 'string' && description.trim().length > 0
          ? description.trim()
          : null,
      frequency: frequency as RecurringFrequency,
      nextDueDate,
      isActive: isActive !== false,
      createdAt: rec.createdAt,
      updatedAt: isNonNegativeInt(rec.updatedAt) ? rec.updatedAt : rec.createdAt,
    });
  }

  // Validate Financial Goals
  const validatedGoals: BackupGoal[] = [];
  const goalIds = new Set<number>();
  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i];
    if (!goal || typeof goal !== 'object') {
      throw new BackupValidationError(`Goal at index ${i} is not an object.`);
    }
    const { id, title, targetAmountMinor, currentSavedMinor, targetDate, status } = goal;

    if (!isPositiveInt(id)) {
      throw new BackupValidationError(`Goal at index ${i} has an invalid id.`);
    }
    if (goalIds.has(id)) {
      throw new BackupValidationError(`Duplicate goal id ${id}.`);
    }
    goalIds.add(id);
    if (typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 60) {
      throw new BackupValidationError(`Goal ${id} has an invalid title.`);
    }
    if (
      typeof targetAmountMinor !== 'number' ||
      !Number.isInteger(targetAmountMinor) ||
      targetAmountMinor <= 0 ||
      targetAmountMinor > MAX_AMOUNT_MINOR_UNITS
    ) {
      throw new BackupValidationError(`Goal ${id} has an invalid targetAmountMinor.`);
    }
    if (!isNonNegativeInt(currentSavedMinor) || currentSavedMinor > MAX_AMOUNT_MINOR_UNITS) {
      throw new BackupValidationError(`Goal ${id} has an invalid currentSavedMinor.`);
    }
    if (targetDate !== null && targetDate !== undefined && !isValidIsoDate(targetDate)) {
      throw new BackupValidationError(`Goal ${id} has an invalid targetDate.`);
    }
    if (!GOAL_STATUSES.includes(status)) {
      throw new BackupValidationError(`Goal ${id} has invalid status "${status}".`);
    }
    if (!isPositiveInt(goal.createdAt)) {
      throw new BackupValidationError(`Goal ${id} createdAt must be a valid timestamp.`);
    }

    validatedGoals.push({
      id,
      title: title.trim(),
      targetAmountMinor,
      currentSavedMinor,
      targetDate: targetDate ?? null,
      status,
      createdAt: goal.createdAt,
      updatedAt: isNonNegativeInt(goal.updatedAt) ? goal.updatedAt : goal.createdAt,
    });
  }

  // Validate Tombstones
  const validatedTombstones: BackupTombstone[] = [];
  const tombstoneIds = new Set<number>();
  for (let i = 0; i < tombstones.length; i++) {
    const tombstone = tombstones[i];
    if (!tombstone || typeof tombstone !== 'object') {
      throw new BackupValidationError(`Tombstone at index ${i} is not an object.`);
    }
    const { id, entityType, entityId, deletedAt } = tombstone;

    if (!isPositiveInt(id)) {
      throw new BackupValidationError(`Tombstone at index ${i} has an invalid id.`);
    }
    if (tombstoneIds.has(id)) {
      throw new BackupValidationError(`Duplicate tombstone id ${id}.`);
    }
    tombstoneIds.add(id);
    if (!TOMBSTONE_TYPES.includes(entityType)) {
      throw new BackupValidationError(`Tombstone ${id} has invalid entityType "${entityType}".`);
    }
    if (!isPositiveInt(entityId)) {
      throw new BackupValidationError(`Tombstone ${id} has an invalid entityId.`);
    }
    if (!isPositiveInt(deletedAt)) {
      throw new BackupValidationError(`Tombstone ${id} has an invalid deletedAt timestamp.`);
    }

    validatedTombstones.push({ id, entityType, entityId, deletedAt });
  }

  return {
    meta: {
      version: 2,
      appVersion: String(parsed.meta.appVersion ?? '0.4.0'),
      exportedAt: String(parsed.meta.exportedAt ?? new Date().toISOString()),
    },
    data: {
      categories: validatedCategories,
      transactions: validatedTransactions,
      budgets: validatedBudgets,
      recurring: validatedRecurring,
      goals: validatedGoals,
      tombstones: validatedTombstones,
    },
  };
}

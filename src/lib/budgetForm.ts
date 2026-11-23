import type { Category, NewBudgetInput } from '../storage/types';
import { parseAmountToMinorUnits } from './money';

export type BudgetFormValidation =
  | { ok: true; input: NewBudgetInput }
  | { ok: false; field: 'amountMinor' | 'form'; message: string };

export function validateBudgetForm(
  amount: string,
  categoryId: number | null,
  expenseCategories: Category[]
): BudgetFormValidation {
  const parsed = parseAmountToMinorUnits(amount);
  if (!parsed.ok) {
    return { ok: false, field: 'amountMinor', message: parsed.error };
  }
  if (
    categoryId !== null &&
    !expenseCategories.some(
      (category) => category.id === categoryId && category.type === 'expense'
    )
  ) {
    return {
      ok: false,
      field: 'form',
      message: 'Choose an expense category.',
    };
  }
  return { ok: true, input: { categoryId, amountMinor: parsed.amountMinor } };
}

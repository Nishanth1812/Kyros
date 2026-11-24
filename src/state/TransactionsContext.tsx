import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  getBudgetStorage,
  getCategoryStorage,
  getDatabaseInstance,
  getGoalStorage,
  getRecurringStorage,
  getTransactionStorage,
} from '../lib/database';
import { findDueRecurringTransactions } from '../lib/recurringEngine';
import {
  exportBackupData,
  restoreBackupData,
  type Budget,
  type Category,
  type FinancialGoal,
  type KyrosBackupV2,
  type NewBudgetInput,
  type NewCategoryInput,
  type NewGoalInput,
  type NewRecurringInput,
  type NewTransactionInput,
  type RecurringTransaction,
  type RestoreResult,
  type Transaction,
} from '../storage';

type LoadStatus = 'loading' | 'ready' | 'error';

interface TransactionsContextValue {
  transactions: Transaction[];
  categories: Category[];
  activeCategories: Category[];
  budgets: Budget[];
  recurring: RecurringTransaction[];
  dueRecurring: RecurringTransaction[];
  goals: FinancialGoal[];
  status: LoadStatus;
  error: string | null;
  /** Re-read transactions, categories, and budgets without replacing lists with a loader. */
  refresh: () => Promise<void>;
  addTransaction: (input: NewTransactionInput) => Promise<Transaction>;
  updateTransaction: (id: number, input: NewTransactionInput) => Promise<Transaction>;
  /** Deletes the requested row if present; an unknown id is a no-op. */
  deleteTransaction: (id: number) => Promise<void>;
  addCategory: (input: NewCategoryInput) => Promise<Category>;
  renameCategory: (id: number, newName: string) => Promise<Category>;
  archiveCategory: (id: number, isArchived: boolean) => Promise<Category>;
  deleteCategory: (idToDelete: number, targetCategoryId: number) => Promise<{ reassignedCount: number }>;
  addRecurring: (input: NewRecurringInput) => Promise<RecurringTransaction>;
  updateRecurring: (id: number, input: Partial<NewRecurringInput>) => Promise<RecurringTransaction>;
  deleteRecurring: (id: number) => Promise<void>;
  toggleRecurringActive: (id: number, isActive: boolean) => Promise<RecurringTransaction>;
  applyRecurring: (id: number, asOfDate?: string) => Promise<{ transaction: Transaction; nextDueDate: string }>;
  applyAllDueRecurring: () => Promise<number>;
  addGoal: (input: NewGoalInput) => Promise<FinancialGoal>;
  updateGoal: (id: number, input: Partial<NewGoalInput>) => Promise<FinancialGoal>;
  deleteGoal: (id: number) => Promise<void>;
  contributeToGoal: (id: number, deltaMinor: number) => Promise<FinancialGoal>;
  /** Creates or updates the limit for a scope, then refreshes the visible list. */
  saveBudget: (input: NewBudgetInput) => Promise<Budget>;
  /** Deletes the requested row if present; an unknown id is a no-op. */
  deleteBudget: (id: number) => Promise<void>;
  exportBackup: () => Promise<KyrosBackupV2>;
  restoreBackup: (payload: unknown) => Promise<RestoreResult>;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent || !hasLoaded.current) setStatus('loading');
    setError(null);
    try {
      const [transactionStorage, categoryStorage, budgetStorage, recurringStorage, goalStorage] =
        await Promise.all([
          getTransactionStorage(),
          getCategoryStorage(),
          getBudgetStorage(),
          getRecurringStorage(),
          getGoalStorage(),
        ]);
      const [list, categoryList, budgetList, recurringList, goalList] = await Promise.all([
        transactionStorage.listTransactions(),
        categoryStorage.listCategories(undefined, true),
        budgetStorage.listBudgets(),
        recurringStorage.listRecurring(),
        goalStorage.listGoals(),
      ]);
      hasLoaded.current = true;
      setTransactions(list);
      setCategories(categoryList);
      setBudgets(budgetList);
      setRecurring(recurringList);
      setGoals(goalList);
      setStatus('ready');
    } catch (cause) {
      setError(toMessage(cause));
      setStatus(hasLoaded.current ? 'ready' : 'error');
    }
  }, []);

  const activeCategories = useMemo(
    () => categories.filter((c) => !c.isArchived),
    [categories]
  );

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const dueRecurring = useMemo(
    () => findDueRecurringTransactions(recurring, todayStr),
    [recurring, todayStr]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

  const addTransaction = useCallback(
    async (input: NewTransactionInput) => {
      const storage = await getTransactionStorage();
      const created = await storage.addTransaction(input);
      hasLoaded.current = true;
      await load(true);
      return created;
    },
    [load]
  );

  const updateTransaction = useCallback(
    async (id: number, input: NewTransactionInput) => {
      const storage = await getTransactionStorage();
      const updated = await storage.updateTransaction(id, input);
      hasLoaded.current = true;
      await load(true);
      return updated;
    },
    [load]
  );

  const deleteTransaction = useCallback(
    async (id: number) => {
      const storage = await getTransactionStorage();
      await storage.deleteTransaction(id);
      hasLoaded.current = true;
      await load(true);
    },
    [load]
  );

  const addCategory = useCallback(
    async (input: NewCategoryInput) => {
      const storage = await getCategoryStorage();
      const created = await storage.createCategory(input);
      hasLoaded.current = true;
      await load(true);
      return created;
    },
    [load]
  );

  const renameCategory = useCallback(
    async (id: number, newName: string) => {
      const storage = await getCategoryStorage();
      const updated = await storage.renameCategory(id, newName);
      hasLoaded.current = true;
      await load(true);
      return updated;
    },
    [load]
  );

  const archiveCategory = useCallback(
    async (id: number, isArchived: boolean) => {
      const storage = await getCategoryStorage();
      const updated = await storage.archiveCategory(id, isArchived);
      hasLoaded.current = true;
      await load(true);
      return updated;
    },
    [load]
  );

  const deleteCategory = useCallback(
    async (idToDelete: number, targetCategoryId: number) => {
      const storage = await getCategoryStorage();
      const result = await storage.deleteCategoryWithReassignment(idToDelete, targetCategoryId);
      hasLoaded.current = true;
      await load(true);
      return result;
    },
    [load]
  );

  const addRecurring = useCallback(
    async (input: NewRecurringInput) => {
      const storage = await getRecurringStorage();
      const created = await storage.addRecurring(input);
      hasLoaded.current = true;
      await load(true);
      return created;
    },
    [load]
  );

  const updateRecurring = useCallback(
    async (id: number, input: Partial<NewRecurringInput>) => {
      const storage = await getRecurringStorage();
      const updated = await storage.updateRecurring(id, input);
      hasLoaded.current = true;
      await load(true);
      return updated;
    },
    [load]
  );

  const deleteRecurring = useCallback(
    async (id: number) => {
      const storage = await getRecurringStorage();
      await storage.deleteRecurring(id);
      hasLoaded.current = true;
      await load(true);
    },
    [load]
  );

  const toggleRecurringActive = useCallback(
    async (id: number, isActive: boolean) => {
      const storage = await getRecurringStorage();
      const updated = await storage.toggleRecurringActive(id, isActive);
      hasLoaded.current = true;
      await load(true);
      return updated;
    },
    [load]
  );

  const applyRecurring = useCallback(
    async (id: number, asOfDate?: string) => {
      const storage = await getRecurringStorage();
      const result = await storage.applyRecurring(id, asOfDate);
      hasLoaded.current = true;
      await load(true);
      return result;
    },
    [load]
  );

  const applyAllDueRecurring = useCallback(async () => {
    const storage = await getRecurringStorage();
    let appliedCount = 0;
    for (const item of dueRecurring) {
      await storage.applyRecurring(item.id, item.nextDueDate);
      appliedCount++;
    }
    hasLoaded.current = true;
    await load(true);
    return appliedCount;
  }, [dueRecurring, load]);

  const addGoal = useCallback(
    async (input: NewGoalInput) => {
      const storage = await getGoalStorage();
      const created = await storage.addGoal(input);
      hasLoaded.current = true;
      await load(true);
      return created;
    },
    [load]
  );

  const updateGoal = useCallback(
    async (id: number, input: Partial<NewGoalInput>) => {
      const storage = await getGoalStorage();
      const updated = await storage.updateGoal(id, input);
      hasLoaded.current = true;
      await load(true);
      return updated;
    },
    [load]
  );

  const deleteGoal = useCallback(
    async (id: number) => {
      const storage = await getGoalStorage();
      await storage.deleteGoal(id);
      hasLoaded.current = true;
      await load(true);
    },
    [load]
  );

  const contributeToGoal = useCallback(
    async (id: number, deltaMinor: number) => {
      const storage = await getGoalStorage();
      const updated = await storage.contributeToGoal(id, deltaMinor);
      hasLoaded.current = true;
      await load(true);
      return updated;
    },
    [load]
  );

  const saveBudget = useCallback(
    async (input: NewBudgetInput) => {
      const storage = await getBudgetStorage();
      const saved = await storage.saveBudget(input);
      hasLoaded.current = true;
      // Persist first. A failed refresh is a separate failure reported through
      // the context's error state; it must not look like a failed save.
      await load(true);
      return saved;
    },
    [load]
  );

  const deleteBudget = useCallback(
    async (id: number) => {
      const storage = await getBudgetStorage();
      await storage.deleteBudget(id);
      hasLoaded.current = true;
      await load(true);
    },
    [load]
  );

  const exportBackup = useCallback(async () => {
    const db = await getDatabaseInstance();
    return exportBackupData(db);
  }, []);

  const restoreBackup = useCallback(
    async (payload: unknown) => {
      const db = await getDatabaseInstance();
      const result = await restoreBackupData(db, payload);
      hasLoaded.current = true;
      await load(true);
      return result;
    },
    [load]
  );

  const value = useMemo<TransactionsContextValue>(
    () => ({
      transactions,
      categories,
      activeCategories,
      budgets,
      recurring,
      dueRecurring,
      goals,
      status,
      error,
      refresh,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addCategory,
      renameCategory,
      archiveCategory,
      deleteCategory,
      addRecurring,
      updateRecurring,
      deleteRecurring,
      toggleRecurringActive,
      applyRecurring,
      applyAllDueRecurring,
      addGoal,
      updateGoal,
      deleteGoal,
      contributeToGoal,
      saveBudget,
      deleteBudget,
      exportBackup,
      restoreBackup,
    }),
    [
      transactions,
      categories,
      activeCategories,
      budgets,
      recurring,
      dueRecurring,
      goals,
      status,
      error,
      refresh,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addCategory,
      renameCategory,
      archiveCategory,
      deleteCategory,
      addRecurring,
      updateRecurring,
      deleteRecurring,
      toggleRecurringActive,
      applyRecurring,
      applyAllDueRecurring,
      addGoal,
      updateGoal,
      deleteGoal,
      contributeToGoal,
      saveBudget,
      deleteBudget,
      exportBackup,
      restoreBackup,
    ]
  );

  return (
    <TransactionsContext.Provider value={value}>
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions(): TransactionsContextValue {
  const context = useContext(TransactionsContext);
  if (!context) {
    throw new Error('useTransactions must be used inside a TransactionsProvider.');
  }
  return context;
}

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
  getTransactionStorage,
} from '../lib/database';
import {
  exportBackupData,
  restoreBackupData,
  type Budget,
  type Category,
  type KyrosBackupV1,
  type NewBudgetInput,
  type NewCategoryInput,
  type NewTransactionInput,
  type RestoreResult,
  type Transaction,
} from '../storage';

type LoadStatus = 'loading' | 'ready' | 'error';

interface TransactionsContextValue {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  status: LoadStatus;
  error: string | null;
  /** Re-read transactions, categories, and budgets without replacing lists with a loader. */
  refresh: () => Promise<void>;
  addTransaction: (input: NewTransactionInput) => Promise<Transaction>;
  updateTransaction: (id: number, input: NewTransactionInput) => Promise<Transaction>;
  /** Deletes the requested row if present; an unknown id is a no-op. */
  deleteTransaction: (id: number) => Promise<void>;
  addCategory: (input: NewCategoryInput) => Promise<Category>;
  /** Creates or updates the limit for a scope, then refreshes the visible list. */
  saveBudget: (input: NewBudgetInput) => Promise<Budget>;
  /** Deletes the requested row if present; an unknown id is a no-op. */
  deleteBudget: (id: number) => Promise<void>;
  exportBackup: () => Promise<KyrosBackupV1>;
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
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent || !hasLoaded.current) setStatus('loading');
    setError(null);
    try {
      const [transactionStorage, categoryStorage, budgetStorage] = await Promise.all([
        getTransactionStorage(),
        getCategoryStorage(),
        getBudgetStorage(),
      ]);
      const [list, categoryList, budgetList] = await Promise.all([
        transactionStorage.listTransactions(),
        categoryStorage.listCategories(),
        budgetStorage.listBudgets(),
      ]);
      hasLoaded.current = true;
      setTransactions(list);
      setCategories(categoryList);
      setBudgets(budgetList);
      setStatus('ready');
    } catch (cause) {
      setError(toMessage(cause));
      setStatus(hasLoaded.current ? 'ready' : 'error');
    }
  }, []);

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
      // The insert succeeded. A failed refresh is a separate failure reported
      // through the context's error state; it must not surface as a failed
      // save or make the caller retry the insertion.
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
      budgets,
      status,
      error,
      refresh,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addCategory,
      saveBudget,
      deleteBudget,
      exportBackup,
      restoreBackup,
    }),
    [
      transactions,
      categories,
      budgets,
      status,
      error,
      refresh,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addCategory,
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

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

import { getCategoryStorage, getTransactionStorage } from '../lib/database';
import type {
  Category,
  NewCategoryInput,
  NewTransactionInput,
  Transaction,
} from '../storage';

type LoadStatus = 'loading' | 'ready' | 'error';

interface TransactionsContextValue {
  transactions: Transaction[];
  categories: Category[];
  status: LoadStatus;
  error: string | null;
  /** Re-read transactions and categories without replacing lists with a loader. */
  refresh: () => Promise<void>;
  addTransaction: (input: NewTransactionInput) => Promise<Transaction>;
  updateTransaction: (id: number, input: NewTransactionInput) => Promise<Transaction>;
  /** Deletes the requested row if present; an unknown id is a no-op. */
  deleteTransaction: (id: number) => Promise<void>;
  addCategory: (input: NewCategoryInput) => Promise<Category>;
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
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent || !hasLoaded.current) setStatus('loading');
    setError(null);
    try {
      const [transactionStorage, categoryStorage] = await Promise.all([
        getTransactionStorage(),
        getCategoryStorage(),
      ]);
      const [list, categoryList] = await Promise.all([
        transactionStorage.listTransactions(),
        categoryStorage.listCategories(),
      ]);
      hasLoaded.current = true;
      setTransactions(list);
      setCategories(categoryList);
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

  const value = useMemo<TransactionsContextValue>(
    () => ({
      transactions,
      categories,
      status,
      error,
      refresh,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addCategory,
    }),
    [
      transactions,
      categories,
      status,
      error,
      refresh,
      addTransaction,
      updateTransaction,
      deleteTransaction,
      addCategory,
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

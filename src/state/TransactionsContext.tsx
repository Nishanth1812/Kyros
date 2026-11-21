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

import { getTransactionStorage } from '../lib/database';
import type { NewTransactionInput, Transaction } from '../storage';

type LoadStatus = 'loading' | 'ready' | 'error';

interface TransactionsContextValue {
  transactions: Transaction[];
  status: LoadStatus;
  error: string | null;
  /** Re-read from SQLite without replacing the current list with a loader. */
  refresh: () => Promise<void>;
  addTransaction: (input: NewTransactionInput) => Promise<Transaction>;
}

const TransactionsContext = createContext<TransactionsContextValue | null>(null);

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (!silent || !hasLoaded.current) setStatus('loading');
    setError(null);
    try {
      const storage = await getTransactionStorage();
      const list = await storage.listTransactions();
      hasLoaded.current = true;
      setTransactions(list);
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

  const addTransaction = useCallback(async (input: NewTransactionInput) => {
    const storage = await getTransactionStorage();
    const created = await storage.addTransaction(input);
    hasLoaded.current = true;
    // The insert succeeded. A failed refresh is a separate failure reported
    // through the context's error state; it must not surface as a failed
    // save or make the caller retry the insertion.
    try {
      const list = await storage.listTransactions();
      setTransactions(list);
      setError(null);
    } catch (cause) {
      setError(toMessage(cause));
    }
    setStatus('ready');
    return created;
  }, []);

  const value = useMemo<TransactionsContextValue>(
    () => ({ transactions, status, error, refresh, addTransaction }),
    [transactions, status, error, refresh, addTransaction]
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

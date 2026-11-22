import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import EditTransactionModal from '../components/EditTransactionModal';
import ScreenHeader from '../components/ScreenHeader';
import {
  EmptyState,
  ErrorBanner,
  ErrorView,
  LoadingView,
} from '../components/StateViews';
import TransactionFiltersBar from '../components/TransactionFilters';
import TransactionList from '../components/TransactionList';
import { formatDisplayDate } from '../lib/dates';
import { formatMinorUnits } from '../lib/money';
import {
  filterTransactions,
  type TransactionFilters,
} from '../lib/transactionFilters';
import type { RootTabParamList } from '../navigation/types';
import type { NewTransactionInput, Transaction } from '../storage';
import { useTransactions } from '../state/TransactionsContext';
import { colors, fontSize, radius, spacing } from '../theme/theme';

type Navigation = BottomTabNavigationProp<RootTabParamList, 'History'>;

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}

function entryLabel(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'} · newest first`;
}

function hasActiveFilters(filters: TransactionFilters): boolean {
  return (
    filters.type !== undefined ||
    filters.categoryId !== undefined ||
    !!filters.dateFrom ||
    !!filters.dateTo
  );
}

export default function HistoryScreen() {
  const {
    transactions,
    categories,
    status,
    error,
    refresh,
    updateTransaction,
    deleteTransaction,
    addCategory,
  } = useTransactions();
  const navigation = useNavigation<Navigation>();
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  // Derive the visible rows from the shared context data. An incomplete or
  // reversed date range is ignored rather than collapsing the list into a
  // false "no matches" state while the user is still typing.
  const { visible, filterError } = useMemo(() => {
    try {
      return { visible: filterTransactions(transactions, filters), filterError: null };
    } catch (cause) {
      const { dateFrom, dateTo, ...rest } = filters;
      return {
        visible: filterTransactions(transactions, rest),
        filterError: toMessage(cause),
      };
    }
  }, [transactions, filters]);

  const active = hasActiveFilters(filters);

  const handleDelete = (transaction: Transaction) => {
    Alert.alert(
      'Delete transaction',
      `Delete this ${transaction.type} of ${formatMinorUnits(
        transaction.amountMinor
      )} on ${formatDisplayDate(transaction.date)}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setActionError(null);
              try {
                await deleteTransaction(transaction.id);
                await refresh();
              } catch (cause) {
                setActionError(toMessage(cause));
              }
            })();
          },
        },
      ]
    );
  };

  const handleEditSubmit = async (input: NewTransactionInput) => {
    if (!editing) return;
    await updateTransaction(editing.id, input);
    await refresh();
  };

  const clearFilters = () => setFilters({});

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <ScreenHeader
          title="History"
          subtitle={
            status === 'ready'
              ? active
                ? `${visible.length} of ${transactions.length} entries · newest first`
                : entryLabel(transactions.length)
              : 'Your saved entries'
          }
        />
      </View>

      {status === 'loading' ? <LoadingView /> : null}
      {status === 'error' ? (
        <ErrorView
          message={error ?? 'Unknown error.'}
          onRetry={() => void refresh()}
        />
      ) : null}
      {status === 'ready' ? (
        <>
          {error ? <ErrorBanner message={error} /> : null}
          {actionError ? <ErrorBanner message={actionError} /> : null}

          {transactions.length > 0 ? (
            <TransactionFiltersBar
              categories={categories}
              value={filters}
              onChange={setFilters}
              onClear={clearFilters}
              active={active}
            />
          ) : null}

          {transactions.length === 0 ? (
            <EmptyState onAdd={() => navigation.navigate('Add')} />
          ) : visible.length === 0 ? (
            <View
              style={styles.centered}
              accessible
              accessibilityLabel="No transactions match the selected filters"
            >
              <Text style={styles.stateTitle} accessibilityRole="header">
                No matches
              </Text>
              <Text style={styles.stateText}>
                No transactions match these filters. Try different filters or
                clear them to see all entries.
              </Text>
              {filterError ? (
                <Text style={styles.filterError} accessibilityRole="alert">
                  {filterError}
                </Text>
              ) : null}
              <Pressable
                onPress={clearFilters}
                accessibilityRole="button"
                accessibilityLabel="Clear filters"
                style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.buttonText}>Clear filters</Text>
              </Pressable>
            </View>
          ) : (
            <TransactionList
              transactions={visible}
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          )}
        </>
      ) : null}

      <EditTransactionModal
        transaction={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSubmit={(input) => handleEditSubmit(input)}
        onCreateCategory={addCategory}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  stateTitle: {
    marginTop: spacing.md,
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  stateText: {
    marginTop: spacing.sm,
    fontSize: fontSize.body,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },
  filterError: {
    marginTop: spacing.sm,
    fontSize: fontSize.small,
    color: colors.danger,
    textAlign: 'center',
  },
  button: {
    marginTop: spacing.xl,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.primaryDark,
  },
  buttonText: {
    color: colors.onPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
});

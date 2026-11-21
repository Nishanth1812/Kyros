import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import ScreenHeader from '../components/ScreenHeader';
import {
  EmptyState,
  ErrorBanner,
  ErrorView,
  LoadingView,
} from '../components/StateViews';
import TransactionList from '../components/TransactionList';
import type { RootTabParamList } from '../navigation/types';
import { useTransactions } from '../state/TransactionsContext';
import { colors, spacing } from '../theme/theme';

type Navigation = BottomTabNavigationProp<RootTabParamList, 'History'>;

function entryLabel(count: number): string {
  return `${count} ${count === 1 ? 'entry' : 'entries'} · newest first`;
}

export default function HistoryScreen() {
  const { transactions, status, error, refresh } = useTransactions();
  const navigation = useNavigation<Navigation>();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <ScreenHeader
          title="History"
          subtitle={
            status === 'ready' ? entryLabel(transactions.length) : 'Your saved entries'
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
          {transactions.length === 0 ? (
            <EmptyState onAdd={() => navigation.navigate('Add')} />
          ) : (
            <TransactionList
              transactions={transactions}
              refreshing={refreshing}
              onRefresh={() => void handleRefresh()}
            />
          )}
        </>
      ) : null}
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
});

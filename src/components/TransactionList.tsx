import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import type { Transaction } from '../storage';
import { colors, spacing } from '../theme/theme';
import TransactionRow from './TransactionRow';

export default function TransactionList({
  transactions,
  refreshing,
  onRefresh,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  refreshing: boolean;
  onRefresh: () => void;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}) {
  return (
    <FlatList
      data={transactions}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <TransactionRow transaction={item} onEdit={onEdit} onDelete={onDelete} />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
      accessibilityLabel="Saved transactions, newest first"
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  separator: {
    height: spacing.md,
  },
});

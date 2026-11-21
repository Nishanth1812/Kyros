import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet } from 'react-native';

import ScreenHeader from '../components/ScreenHeader';
import TransactionForm from '../components/TransactionForm';
import type { RootTabParamList } from '../navigation/types';
import { useTransactions } from '../state/TransactionsContext';
import { spacing } from '../theme/theme';

type Navigation = BottomTabNavigationProp<RootTabParamList, 'Add'>;

export default function AddTransactionScreen() {
  const { addTransaction } = useTransactions();
  const navigation = useNavigation<Navigation>();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader
        title="New transaction"
        subtitle="Record income or an expense. Entries stay on this device."
      />
      <TransactionForm
        onSubmit={async (input) => {
          await addTransaction(input);
          navigation.navigate('History');
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F4F7F4',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});

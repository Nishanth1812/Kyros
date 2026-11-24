import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenHeader from '../components/ScreenHeader';
import TransactionForm from '../components/TransactionForm';
import type { RootTabParamList } from '../navigation/types';
import { useTransactions } from '../state/TransactionsContext';
import { useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, spacing } from '../theme/theme';

type Navigation = BottomTabNavigationProp<RootTabParamList, 'Add'>;

export default function AddTransactionScreen() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { addTransaction, addCategory, activeCategories } = useTransactions();
  const navigation = useNavigation<Navigation>();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <ScreenHeader
        title="New transaction"
        subtitle="Record income or an expense. Entries stay on this device."
      />
      <TransactionForm
        categories={activeCategories}
        onCreateCategory={addCategory}
        onSubmit={async (input) => {
          await addTransaction(input);
          navigation.navigate('History');
        }}
      />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 720,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
  },
});

import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  type CompositeNavigationProp,
  useNavigation,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenHeader from '../components/ScreenHeader';
import TransactionForm from '../components/TransactionForm';
import type { RootStackParamList, RootTabParamList } from '../navigation/types';
import { useTransactions } from '../state/TransactionsContext';
import { responsivePageContentStyle, touchTargetStyle } from '../theme/layout';
import { useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, fontSize, radius, spacing } from '../theme/theme';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Add'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export default function AddTransactionScreen() {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { addTransaction, addCategory, activeCategories } = useTransactions();
  const navigation = useNavigation<Navigation>();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        responsivePageContentStyle,
        { maxWidth: 720, paddingTop: insets.top + spacing.lg },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <ScreenHeader
        title="New transaction"
        subtitle="Record income or an expense. Entries stay on this device."
        onSettingsPress={() => navigation.navigate('Settings')}
      />
      <TouchableOpacity
        style={styles.manageCategoriesButton}
        onPress={() => navigation.navigate('CategoryManagement')}
        accessibilityRole="button"
        accessibilityLabel="Manage Categories: rename, archive, or delete with reassignment"
      >
        <Text style={styles.manageCategoriesButtonText}>⚙ Manage Categories</Text>
      </TouchableOpacity>
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
  manageCategoriesButton: {
    ...touchTargetStyle,
    backgroundColor: colors.subtleGreen,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  manageCategoriesButtonText: {
    color: colors.primary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
});

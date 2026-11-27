import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  type CompositeNavigationProp,
  useNavigation,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import {
  filterTransactionsByQueryAndTags,
  parseTags,
} from '../lib/transactionSearch';
import type { RootStackParamList, RootTabParamList } from '../navigation/types';
import type { NewTransactionInput, Transaction } from '../storage';
import { useTransactions } from '../state/TransactionsContext';
import { responsivePageWidthStyle } from '../theme/layout';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, fontSize, radius, spacing } from '../theme/theme';

type Navigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'History'>,
  NativeStackNavigationProp<RootStackParamList>
>;

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
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
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
  const { baseFiltered, filterError } = useMemo(() => {
    try {
      return { baseFiltered: filterTransactions(transactions, filters), filterError: null };
    } catch (cause) {
      const { dateFrom, dateTo, ...rest } = filters;
      return {
        baseFiltered: filterTransactions(transactions, rest),
        filterError: toMessage(cause),
      };
    }
  }, [transactions, filters]);

  // Tag chips describe the set the user is already browsing, so they react to
  // the type/category/date filters but not to the selected tag itself. A
  // selected tag stays visible even if the filters changed underneath it so it
  // can always be tapped off.
  const availableTags = useMemo(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const transaction of baseFiltered) {
      for (const tag of parseTags(transaction.description)) {
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
      }
    }
    tags.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    if (selectedTag !== null && !seen.has(selectedTag.toLowerCase())) {
      tags.unshift(selectedTag);
    }
    return tags;
  }, [baseFiltered, selectedTag]);

  const visible = useMemo(
    () =>
      filterTransactionsByQueryAndTags(
        baseFiltered,
        categories,
        query,
        selectedTag ?? undefined
      ),
    [baseFiltered, categories, query, selectedTag]
  );

  const searching = query.trim() !== '' || selectedTag !== null;
  const active = hasActiveFilters(filters) || searching;

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

  const clearSearch = () => {
    setQuery('');
    setSelectedTag(null);
  };

  const clearAll = () => {
    clearFilters();
    clearSearch();
  };

  const toggleTag = (tag: string) => {
    setSelectedTag((current) =>
      current !== null && current.toLowerCase() === tag.toLowerCase() ? null : tag
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <ScreenHeader
          title="History"
          subtitle={
            status === 'ready'
              ? active
                ? `${visible.length} of ${transactions.length} entries · newest first`
                : entryLabel(transactions.length)
              : 'Your saved entries'
          }
          onSettingsPress={() => navigation.navigate('Settings')}
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
            <>
              <View style={styles.searchRow}>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search notes, category, or amount"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  accessibilityLabel="Search transactions"
                  accessibilityHint="Filters history by description, category name, or amount"
                  style={styles.searchInput}
                />
                {query.length > 0 ? (
                  <Pressable
                    onPress={() => setQuery('')}
                    accessibilityRole="button"
                    accessibilityLabel="Clear search text"
                    style={({ pressed }) => [
                      styles.clearSearchButton,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={styles.clearSearchText}>✕</Text>
                  </Pressable>
                ) : null}
              </View>

              {availableTags.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.tagScroll}
                  contentContainerStyle={styles.tagScrollContent}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Filter by hashtag"
                >
                  {availableTags.map((tag) => {
                    const selected =
                      selectedTag !== null &&
                      selectedTag.toLowerCase() === tag.toLowerCase();
                    return (
                      <Pressable
                        key={tag}
                        onPress={() => toggleTag(tag)}
                        accessibilityRole="radio"
                        accessibilityLabel={`Filter by ${tag}`}
                        accessibilityHint="Toggles this hashtag filter"
                        accessibilityState={{ selected }}
                        style={({ pressed }) => [
                          styles.tagChip,
                          selected ? styles.tagChipSelected : null,
                          pressed ? styles.pressed : null,
                        ]}
                      >
                        <Text
                          style={[
                            styles.tagText,
                            selected ? styles.tagTextSelected : null,
                          ]}
                          numberOfLines={1}
                        >
                          {tag}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}

              <TransactionFiltersBar
                categories={categories}
                value={filters}
                onChange={setFilters}
                onClear={clearFilters}
                active={hasActiveFilters(filters)}
              />
            </>
          ) : null}

          {transactions.length === 0 ? (
            <EmptyState onAdd={() => navigation.navigate('Add')} />
          ) : visible.length === 0 ? (
            <View
              style={styles.centered}
              accessible
              accessibilityLabel="No transactions match the current search and filters"
            >
              <Text style={styles.stateTitle} accessibilityRole="header">
                No matches
              </Text>
              <Text style={styles.stateText}>
                {searching
                  ? 'No transactions match this search. Try a different word or hashtag, or clear the search to see all entries.'
                  : 'No transactions match these filters. Try different filters or clear them to see all entries.'}
              </Text>
              {filterError ? (
                <Text style={styles.filterError} accessibilityRole="alert">
                  {filterError}
                </Text>
              ) : null}
              <Pressable
                onPress={clearAll}
                accessibilityRole="button"
                accessibilityLabel="Clear search and filters"
                style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
              >
                <Text style={styles.buttonText}>Clear search and filters</Text>
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

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      ...responsivePageWidthStyle,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    searchRow: {
      ...responsivePageWidthStyle,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    searchInput: {
      flex: 1,
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      fontSize: fontSize.body,
      color: colors.textPrimary,
    },
    clearSearchButton: {
      minHeight: 48,
      minWidth: 48,
      marginLeft: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    clearSearchText: {
      fontSize: fontSize.body,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    tagScroll: {
      ...responsivePageWidthStyle,
      flexGrow: 0,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    tagScrollContent: {
      gap: spacing.sm,
      paddingRight: spacing.md,
    },
    tagChip: {
      minHeight: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tagChipSelected: {
      backgroundColor: colors.subtleGreen,
      borderColor: colors.primary,
    },
    tagText: {
      fontSize: fontSize.small,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tagTextSelected: {
      color: colors.primary,
    },
    pressed: {
      opacity: 0.7,
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
      color: colors.textPrimary,
      textAlign: 'center',
    },
    stateText: {
      marginTop: spacing.sm,
      fontSize: fontSize.body,
      lineHeight: 22,
      color: colors.textSecondary,
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

import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  normalizeDateBounds,
  type TransactionFilters as FilterValues,
} from '../lib/transactionFilters';
import type { Category, TransactionType } from '../storage';
import { colors, fontSize, radius, spacing } from '../theme/theme';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isPartialDate(value?: string): boolean {
  return !!value && !ISO_DATE_RE.test(value);
}

function hasInvalidRange(dateFrom?: string, dateTo?: string): boolean {
  try {
    normalizeDateBounds(dateFrom, dateTo);
    return false;
  } catch {
    return true;
  }
}

/**
 * Controlled filter controls for History. All filter state lives in the
 * screen; this component only renders the controls and reports changes.
 */
export default function TransactionFiltersBar({
  categories,
  value,
  onChange,
  onClear,
  active,
}: {
  categories: Category[];
  value: FilterValues;
  onChange: (next: FilterValues) => void;
  onClear: () => void;
  active: boolean;
}) {
  const showDateHint =
    isPartialDate(value.dateFrom) ||
    isPartialDate(value.dateTo) ||
    hasInvalidRange(value.dateFrom, value.dateTo);

  const typeOptions: Array<{ label: string; value?: TransactionType }> = [
    { label: 'All' },
    { label: 'Income', value: 'income' },
    { label: 'Expense', value: 'expense' },
  ];

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel="Transaction filters"
    >
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Filters
        </Text>
        {active ? (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear filters"
            accessibilityHint="Removes all type, category and date filters"
            style={({ pressed }) => [styles.clearButton, pressed ? styles.pressed : null]}
          >
            <Text style={styles.clearText}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.sectionLabel}>Type</Text>
      <View
        style={styles.chips}
        accessibilityRole="radiogroup"
        accessibilityLabel="Filter by type"
      >
        {typeOptions.map((option) => {
          const selected = value.type === option.value;
          return (
            <Pressable
              key={option.label}
              onPress={() => onChange({ ...value, type: option.value })}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.chip,
                selected ? styles.chipSelected : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                style={[styles.chipText, selected ? styles.chipTextSelected : null]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Category</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipScroll}
        accessibilityRole="radiogroup"
        accessibilityLabel="Filter by category"
      >
        <Pressable
          onPress={() => onChange({ ...value, categoryId: undefined })}
          accessibilityRole="radio"
          accessibilityLabel="All categories"
          accessibilityState={{ selected: value.categoryId === undefined }}
          style={({ pressed }) => [
            styles.chip,
            value.categoryId === undefined ? styles.chipSelected : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Text
            style={[
              styles.chipText,
              value.categoryId === undefined ? styles.chipTextSelected : null,
            ]}
          >
            All
          </Text>
        </Pressable>
        {categories.map((category) => {
          const selected = value.categoryId === category.id;
          return (
            <Pressable
              key={category.id}
              onPress={() => onChange({ ...value, categoryId: category.id })}
              accessibilityRole="radio"
              accessibilityLabel={category.name}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.chip,
                selected ? styles.chipSelected : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                style={[styles.chipText, selected ? styles.chipTextSelected : null]}
              >
                {category.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.sectionLabel}>Date range (inclusive)</Text>
      <View style={styles.dateRow}>
        <TextInput
          value={value.dateFrom ?? ''}
          onChangeText={(text) => onChange({ ...value, dateFrom: text })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="From date"
          accessibilityHint="Start date in YYYY-MM-DD format; leave blank for no start"
          style={[styles.dateInput, showDateHint ? styles.dateInputHint : null]}
        />
        <Text style={styles.dateSeparator}>to</Text>
        <TextInput
          value={value.dateTo ?? ''}
          onChangeText={(text) => onChange({ ...value, dateTo: text })}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel="To date"
          accessibilityHint="End date in YYYY-MM-DD format; leave blank for no end"
          style={[styles.dateInput, showDateHint ? styles.dateInputHint : null]}
        />
      </View>
      {showDateHint ? (
        <Text
          style={styles.hintText}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          Use complete YYYY-MM-DD dates, with the start on or before the end.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: fontSize.label,
    fontWeight: '700',
    color: colors.text,
  },
  clearButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  clearText: {
    fontSize: fontSize.small,
    fontWeight: '700',
    color: colors.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  sectionLabel: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textMuted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chipScroll: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: {
    backgroundColor: colors.subtleGreen,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: fontSize.small,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chipTextSelected: {
    color: colors.primary,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.small,
    color: colors.text,
  },
  dateInputHint: {
    borderColor: colors.danger,
    backgroundColor: colors.errorBackground,
  },
  dateSeparator: {
    fontSize: fontSize.small,
    color: colors.textMuted,
  },
  hintText: {
    marginTop: spacing.xs,
    fontSize: fontSize.caption,
    color: colors.danger,
  },
});

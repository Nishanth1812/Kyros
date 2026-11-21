import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { todayISO } from '../lib/dates';
import { parseAmountToMinorUnits, refreshAmountError } from '../lib/money';
import {
  validateTransactionInput,
  type NewTransactionInput,
  type TransactionType,
  type ValidationField,
} from '../storage';
import { colors, elevation, fontSize, radius, spacing } from '../theme/theme';

type FieldErrors = Partial<Record<ValidationField | 'form', string>>;

const OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

function toMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Could not save the transaction. Please try again.';
}

export default function TransactionForm({
  onSubmit,
}: {
  onSubmit: (input: NewTransactionInput) => Promise<void>;
}) {
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO);
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // Synchronous guard against double taps: React state updates are async, so
  // the `submitting` flag alone still reads false for a second tap that lands
  // before the re-render.
  const submittingRef = useRef(false);

  const handleAmountChange = (text: string) => {
    setAmount(text);
    // Keep the visible amount error in sync with the current text: clear it
    // once the value is valid, refresh it if the edit is still invalid, and
    // leave date/description/form errors alone.
    setErrors((prev) => refreshAmountError(prev, text));
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;

    const parsedAmount = parseAmountToMinorUnits(amount);
    const validation = validateTransactionInput({
      type,
      amountMinor: parsedAmount.ok ? parsedAmount.amountMinor : undefined,
      date,
      description,
    });

    const nextErrors: FieldErrors = {};
    for (const issue of validation.errors) {
      if (issue.field !== 'amountMinor') nextErrors[issue.field] = issue.message;
    }
    if (!parsedAmount.ok) {
      nextErrors.amountMinor = parsedAmount.error;
    } else {
      const amountIssue = validation.errors.find(
        (issue) => issue.field === 'amountMinor'
      );
      if (amountIssue) nextErrors.amountMinor = amountIssue.message;
    }
    setErrors(nextErrors);

    if (!validation.ok || !validation.value || !parsedAmount.ok) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(validation.value);
      setAmount('');
      setDescription('');
      setDate(todayISO());
      setErrors({});
    } catch (error) {
      setErrors({ form: toMessage(error) });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Transaction type</Text>
      <View style={styles.segment} accessibilityRole="radiogroup">
        {OPTIONS.map((option) => {
          const selected = type === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setType(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              style={[
                styles.segmentOption,
                selected &&
                  (option.value === 'income'
                    ? styles.segmentIncome
                    : styles.segmentExpense),
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  selected && styles.segmentTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, styles.labelSpaced]}>Amount (₹)</Text>
      <TextInput
        value={amount}
        onChangeText={handleAmountChange}
        keyboardType="decimal-pad"
        placeholder="0.00"
        maxLength={18}
        editable={!submitting}
        accessibilityLabel="Amount in rupees"
        accessibilityHint="Enter an amount in rupees and paise, for example 125 or 125.50"
        style={[styles.input, errors.amountMinor ? styles.inputError : null]}
      />
      {errors.amountMinor ? (
        <Text
          style={styles.errorText}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errors.amountMinor}
        </Text>
      ) : (
        <Text style={styles.helperText}>Indian rupees · up to 2 decimals (paise)</Text>
      )}

      <Text style={[styles.label, styles.labelSpaced]}>Date</Text>
      <TextInput
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        maxLength={10}
        autoCapitalize="none"
        editable={!submitting}
        accessibilityLabel="Date in YYYY-MM-DD format"
        accessibilityHint="Enter a calendar date, for example 2026-11-21"
        style={[styles.input, errors.date ? styles.inputError : null]}
      />
      {errors.date ? (
        <Text
          style={styles.errorText}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errors.date}
        </Text>
      ) : (
        <Text style={styles.helperText}>Format: YYYY-MM-DD</Text>
      )}

      <Text style={[styles.label, styles.labelSpaced]}>Description (optional)</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What was this for?"
        multiline
        maxLength={120}
        editable={!submitting}
        accessibilityLabel="Description, optional"
        style={[styles.input, styles.multiline, errors.description ? styles.inputError : null]}
      />
      {errors.description ? (
        <Text
          style={styles.errorText}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errors.description}
        </Text>
      ) : null}

      {errors.form ? (
        <Text
          style={styles.formError}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {errors.form}
        </Text>
      ) : null}

      <Pressable
        onPress={() => void handleSubmit()}
        disabled={submitting}
        accessibilityRole="button"
        accessibilityLabel="Save transaction"
        accessibilityState={{ disabled: submitting }}
        style={({ pressed }) => [
          styles.submitButton,
          pressed && !submitting ? styles.submitPressed : null,
          submitting ? styles.submitDisabled : null,
        ]}
      >
        {submitting ? (
          <ActivityIndicator color={colors.onPrimary} />
        ) : (
          <Text style={styles.submitText}>Save transaction</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...elevation,
  },
  label: {
    fontSize: fontSize.label,
    fontWeight: '600',
    color: colors.text,
  },
  labelSpaced: {
    marginTop: spacing.lg,
  },
  segment: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentOption: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  segmentExpense: {
    backgroundColor: colors.subtleRed,
    borderColor: colors.expense,
  },
  segmentIncome: {
    backgroundColor: colors.subtleGreen,
    borderColor: colors.income,
  },
  segmentText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
  },
  segmentTextSelected: {
    color: colors.text,
  },
  input: {
    marginTop: spacing.sm,
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.text,
  },
  multiline: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: colors.danger,
    backgroundColor: colors.errorBackground,
  },
  helperText: {
    marginTop: spacing.xs,
    fontSize: fontSize.caption,
    color: colors.textMuted,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: fontSize.small,
    color: colors.danger,
  },
  formError: {
    marginTop: spacing.md,
    fontSize: fontSize.small,
    color: colors.danger,
  },
  submitButton: {
    marginTop: spacing.xl,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  submitPressed: {
    backgroundColor: colors.primaryDark,
  },
  submitDisabled: {
    opacity: 0.7,
  },
  submitText: {
    color: colors.onPrimary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
});

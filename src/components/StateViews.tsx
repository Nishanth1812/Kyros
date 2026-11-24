import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, fontSize, radius, spacing } from '../theme/theme';

export function LoadingView({ subject = 'transactions' }: { subject?: string } = {}) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.centered} accessibilityRole="progressbar" accessibilityLabel={`Loading ${subject}`}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>Loading {subject}…</Text>
    </View>
  );
}

export function ErrorView({
  message,
  onRetry,
  subject = 'transactions',
}: {
  message: string;
  onRetry: () => void;
  subject?: string;
}) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.centered}>
      <Text style={[styles.stateIcon, { fontSize: 48, color: colors.expense }]}>ⓘ</Text>
      <Text style={styles.stateTitle} accessibilityRole="header">
        Couldn’t load {subject}
      </Text>
      <Text style={styles.stateText}>{message}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
      >
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

export function EmptyState({ onAdd }: { onAdd: () => void }) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.centered}>
      <Text style={[styles.stateIcon, { fontSize: 56, color: colors.primary }]}>▤</Text>
      <Text style={styles.stateTitle} accessibilityRole="header">
        No transactions yet
      </Text>
      <Text style={styles.stateText}>
        Add your first income or expense. Entries are stored on this device and
        stay available offline.
      </Text>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel="Add your first transaction"
        style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
      >
        <Text style={styles.buttonText}>Add your first transaction</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  stateIcon: {
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.body,
    color: colors.textMuted,
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
  banner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.errorBackground,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  bannerText: {
    color: colors.danger,
    fontSize: fontSize.small,
  },
});

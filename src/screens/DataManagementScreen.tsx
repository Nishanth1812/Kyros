import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenHeader from '../components/ScreenHeader';
import { defaultFileBridge } from '../lib/fileBridge';
import { useTransactions } from '../state/TransactionsContext';
import { validateBackupPayload } from '../storage/backupValidation';
import { colors, elevation, fontSize, radius, spacing } from '../theme/theme';

export default function DataManagementScreen() {
  const { transactions, categories, budgets, exportBackup, restoreBackup } = useTransactions();
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  const incomeCount = transactions.filter((t) => t.type === 'income').length;
  const expenseCount = transactions.filter((t) => t.type === 'expense').length;
  const customCategoriesCount = categories.filter((c) => !c.isBuiltin).length;

  const handleExport = async () => {
    setIsExporting(true);
    setFeedback(null);
    try {
      const backup = await exportBackup();
      const jsonString = JSON.stringify(backup, null, 2);
      const today = new Date().toISOString().split('T')[0];
      const filename = `kyros-backup-${today}.json`;
      const saved = await defaultFileBridge.saveBackupFile(filename, jsonString);
      if (saved) {
        setFeedback({ message: 'Backup exported and saved successfully.', isError: false });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export backup.';
      setFeedback({ message: msg, isError: true });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestore = async () => {
    setFeedback(null);
    try {
      const fileContent = await defaultFileBridge.pickBackupFile();
      if (!fileContent) {
        return;
      }

      let validated;
      try {
        validated = validateBackupPayload(fileContent);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid backup format.';
        setFeedback({ message: `Restore rejected: ${msg}`, isError: true });
        return;
      }

      const txCount = validated.data.transactions.length;
      const catCount = validated.data.categories.length;
      const budgetCount = validated.data.budgets.length;
      const exportDate = new Date(validated.meta.exportedAt).toLocaleDateString();

      Alert.alert(
        'Confirm Data Restore',
        `This backup from ${exportDate} contains:\n• ${txCount} transactions\n• ${catCount} categories\n• ${budgetCount} budgets\n\nRestoring will completely replace all existing records on this device. Do you want to proceed?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Backup Current First',
            onPress: async () => {
              await handleExport();
            },
          },
          {
            text: 'Replace & Restore',
            style: 'destructive',
            onPress: async () => {
              setIsRestoring(true);
              try {
                const res = await restoreBackup(validated);
                setFeedback({
                  message: `Successfully restored ${res.transactionsCount} transactions, ${res.categoriesCount} categories, and ${res.budgetsCount} budgets.`,
                  isError: false,
                });
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Restore failed.';
                setFeedback({ message: `Restore error: ${msg}`, isError: true });
              } finally {
                setIsRestoring(false);
              }
            },
          },
        ]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to pick backup file.';
      setFeedback({ message: msg, isError: true });
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      accessible={false}
    >
      <ScreenHeader
        title="Data Safety"
        subtitle="Manage local backups and data recovery"
      />

      {feedback && (
        <View
          style={[
            styles.banner,
            feedback.isError ? styles.bannerError : styles.bannerSuccess,
          ]}
          accessible={true}
          accessibilityRole="alert"
          accessibilityLabel={feedback.message}
        >
          <Text
            style={[
              styles.bannerText,
              feedback.isError ? styles.bannerTextError : styles.bannerTextSuccess,
            ]}
          >
            {feedback.message}
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Stored Records Overview</Text>
        <Text style={styles.cardSubtitle}>
          All data is stored purely locally on your device in offline SQLite storage.
        </Text>

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{transactions.length}</Text>
            <Text style={styles.statLabel}>Transactions</Text>
            <Text style={styles.statDetail}>
              {incomeCount} in · {expenseCount} out
            </Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statValue}>{categories.length}</Text>
            <Text style={styles.statLabel}>Categories</Text>
            <Text style={styles.statDetail}>{customCategoriesCount} custom</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statValue}>{budgets.length}</Text>
            <Text style={styles.statLabel}>Budgets</Text>
            <Text style={styles.statDetail}>configured</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backup & Recovery</Text>
        <Text style={styles.cardDescription}>
          Export a complete, portable JSON backup of your transactions, categories, and budgets using Android's file manager. You can safely store it anywhere or use it to restore your data.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, isExporting && styles.buttonDisabled]}
          onPress={handleExport}
          disabled={isExporting}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Export local backup"
          accessibilityHint="Saves a JSON backup file to your device via the file manager"
        >
          {isExporting ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryButtonText}>Export Local Backup</Text>
          )}
        </TouchableOpacity>

        <View style={styles.divider} />

        <Text style={styles.cardDescription}>
          Restore your data from a previous Kyros backup file. Restoring will validate the file format and completely replace the data currently on this device.
        </Text>

        <TouchableOpacity
          style={[styles.secondaryButton, isRestoring && styles.buttonDisabled]}
          onPress={handleRestore}
          disabled={isRestoring}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Restore backup file"
          accessibilityHint="Selects and restores a previously exported backup file"
        >
          {isRestoring ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.secondaryButtonText}>Restore From Backup</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  banner: {
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  bannerSuccess: {
    backgroundColor: colors.subtleGreen,
    borderColor: colors.income,
    borderWidth: 1,
  },
  bannerError: {
    backgroundColor: colors.errorBackground,
    borderColor: colors.expense,
    borderWidth: 1,
  },
  bannerText: {
    fontSize: fontSize.caption,
    fontWeight: '500',
  },
  bannerTextSuccess: {
    color: colors.income,
  },
  bannerTextError: {
    color: colors.expense,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...elevation,
  },
  cardTitle: {
    fontSize: fontSize.heading,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardSubtitle: {
    fontSize: fontSize.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  cardDescription: {
    fontSize: fontSize.body,
    color: colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSize.title,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.xs,
  },
  statDetail: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    ...elevation,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
});

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import ScreenHeader from '../components/ScreenHeader';
import { formatTransactionsToCsv } from '../lib/csvExport';
import { getSyncStorage } from '../lib/database';
import { defaultFileBridge } from '../lib/fileBridge';
import { useTransactions } from '../state/TransactionsContext';
import { validateBackupPayload } from '../storage/backupValidation';
import type { SyncStorageInfo } from '../storage/types';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, elevation, fontSize, radius, spacing } from '../theme/theme';
import CategoryManagementScreen from './CategoryManagementScreen';

function formatSyncTimestamp(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return 'No changes recorded yet';
  return new Date(timestamp).toLocaleString();
}

export default function DataManagementScreen() {
  const styles = useThemedStyles(createStyles);
  const { colors, mode, setMode } = useTheme();
  const { transactions, categories, budgets, exportBackup, restoreBackup } = useTransactions();
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [syncInfo, setSyncInfo] = useState<SyncStorageInfo | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storage = await getSyncStorage();
        const info = await storage.getSyncInfo();
        if (!cancelled) {
          setSyncInfo(info);
          setSyncError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setSyncError(err instanceof Error ? err.message : 'Sync status unavailable.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleExportCsv = async () => {
    if (transactions.length === 0) {
      setFeedback({ message: 'No transactions to export.', isError: true });
      return;
    }
    setIsExportingCsv(true);
    setFeedback(null);
    try {
      const csvString = formatTransactionsToCsv(transactions, categories);
      const today = new Date().toISOString().split('T')[0];
      const filename = `kyros-transactions-${today}.csv`;
      const saved = await defaultFileBridge.saveBackupFile(filename, csvString, 'text/csv');
      if (saved) {
        setFeedback({
          message: `Exported ${transactions.length} transactions as CSV successfully.`,
          isError: false,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export CSV report.';
      setFeedback({ message: msg, isError: true });
    } finally {
      setIsExportingCsv(false);
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

  if (showCategoryManagement) {
    return <CategoryManagementScreen onBack={() => setShowCategoryManagement(false)} />;
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      accessible={false}
    >
      <ScreenHeader
        title="Data Safety"
        subtitle="Manage local backups, exports, and data recovery"
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

      {/* Theme Appearance Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Appearance</Text>
        <Text style={styles.cardSubtitle}>
          Choose how Kyros looks. System follows your device setting.
        </Text>
        <View style={styles.themeRow}>
          {(['system', 'light', 'dark'] as const).map((option) => {
            const selected = mode === option;
            const label =
              option === 'system' ? 'System' : option === 'light' ? 'Light' : 'Dark';
            return (
              <Pressable
                key={option}
                onPress={() => setMode(option)}
                accessible
                accessibilityRole="radio"
                accessibilityLabel={`${label} theme`}
                accessibilityState={{ selected }}
                style={[
                  styles.themeOption,
                  selected ? styles.themeOptionSelected : null,
                ]}
              >
                <Text
                  style={[
                    styles.themeOptionText,
                    selected ? styles.themeOptionTextSelected : null,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Database Overview Card */}
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

        <TouchableOpacity
          style={styles.manageCategoriesButton}
          onPress={() => setShowCategoryManagement(true)}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Manage Categories: rename, archive, or delete with reassignment"
        >
          <Text style={styles.manageCategoriesButtonText}>⚙ Manage Categories</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Readiness Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sync Readiness (Local Only)</Text>
        <Text style={styles.cardSubtitle}>
          Offline-first delta engine status. No network transport is configured; local
          SQLite remains the source of truth.
        </Text>

        {syncError ? (
          <Text style={styles.cardDescription}>{`Sync status unavailable: ${syncError}`}</Text>
        ) : (
          <>
            <Text style={styles.cardDescription}>
              {`Latest change: ${formatSyncTimestamp(syncInfo?.latestUpdatedAt ?? 0)}`}
            </Text>
            <Text style={styles.cardDescription}>
              {`Deletion markers recorded: ${syncInfo?.tombstoneCount ?? 0}`}
            </Text>
          </>
        )}
      </View>

      {/* CSV Spreadsheet Export Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Spreadsheet Report (CSV)</Text>
        <Text style={styles.cardDescription}>
          Export all transactions into a standard comma-separated (.csv) spreadsheet file readable by Google Sheets, Microsoft Excel, or personal accounting software.
        </Text>

        <TouchableOpacity
          style={[styles.outlineButton, isExportingCsv && styles.buttonDisabled]}
          onPress={handleExportCsv}
          disabled={isExportingCsv}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Export transactions as CSV"
          accessibilityHint="Saves all transactions to a CSV spreadsheet file on your device"
        >
          {isExportingCsv ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.outlineButtonText}>Export Transactions (CSV)</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* JSON Backup & Restore Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backup & Recovery (JSON)</Text>
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
  outlineButton: {
    backgroundColor: colors.subtleGreen,
    borderColor: colors.primary,
    borderWidth: 1.5,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  outlineButtonText: {
    color: colors.primary,
    fontSize: fontSize.body,
    fontWeight: '700',
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
  themeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  themeOption: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  themeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.subtleGreen,
  },
  themeOptionText: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textMuted,
  },
  themeOptionTextSelected: {
    color: colors.primary,
  },
  manageCategoriesButton: {
    minHeight: 48,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  manageCategoriesButtonText: {
    color: colors.primary,
    fontSize: fontSize.body,
    fontWeight: '700',
  },
});

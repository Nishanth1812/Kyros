import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ScreenHeader from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { responsivePageContentStyle, touchTargetStyle } from '../theme/layout';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import {
  type ThemeColors,
  type ThemeMode,
  elevation,
  fontSize,
  radius,
  spacing,
} from '../theme/theme';
import packageJson from '../../package.json';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen({ navigation }: Props) {
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { mode, setMode } = useTheme();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        responsivePageContentStyle,
        { paddingTop: insets.top + spacing.md },
      ]}
    >
      <Pressable
        onPress={() => navigation.goBack()}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Back to previous screen"
        style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.backButtonText}>← Back</Text>
      </Pressable>

      <ScreenHeader
        title="Settings"
        subtitle="Appearance and app information"
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          Appearance
        </Text>
        <Text style={styles.cardSubtitle}>
          Choose how Kyros looks. System follows your device setting.
        </Text>
        <View
          style={styles.themeRow}
          accessibilityRole="radiogroup"
          accessibilityLabel="Appearance theme"
        >
          {THEME_OPTIONS.map((option) => {
            const selected = mode === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => setMode(option.value)}
                accessible
                accessibilityRole="radio"
                accessibilityLabel={`${option.label} theme`}
                accessibilityHint="Applies immediately and is saved on this device"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.themeOption,
                  selected ? styles.themeOptionSelected : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text
                  style={[
                    styles.themeOptionText,
                    selected ? styles.themeOptionTextSelected : null,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle} accessibilityRole="header">
          About Kyros
        </Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Version</Text>
          <Text style={styles.infoValue}>{packageJson.version}</Text>
        </View>
        <View style={styles.divider} />
        <Text style={styles.aboutText}>
          Kyros is a private, local-first finance tracker. Your entries stay in
          on-device storage; there is no account and no cloud sync. Backups and
          data tools are on the Data tab.
        </Text>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    backButton: {
      ...touchTargetStyle,
      alignSelf: 'flex-start',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.sm,
    },
    backButtonText: {
      fontSize: fontSize.body,
      fontWeight: '700',
      color: colors.primary,
    },
    pressed: {
      opacity: 0.7,
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
    themeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    themeOption: {
      ...touchTargetStyle,
      flex: 1,
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
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 48,
    },
    infoLabel: {
      fontSize: fontSize.body,
      color: colors.textMuted,
    },
    infoValue: {
      fontSize: fontSize.body,
      fontWeight: '700',
      color: colors.text,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.sm,
    },
    aboutText: {
      fontSize: fontSize.body,
      lineHeight: 22,
      color: colors.textMuted,
    },
  });

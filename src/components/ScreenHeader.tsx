import { Pressable, StyleSheet, Text, View } from 'react-native';

import { touchTargetStyle } from '../theme/layout';
import { useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, fontSize, radius, spacing } from '../theme/theme';

export default function ScreenHeader({
  title,
  subtitle,
  onSettingsPress,
}: {
  title: string;
  subtitle?: string;
  onSettingsPress?: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <View style={styles.textContainer}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {onSettingsPress ? (
        <Pressable
          onPress={onSettingsPress}
          accessible
          accessibilityRole="button"
          accessibilityLabel="Open settings"
          accessibilityHint="Change appearance and view app information"
          style={({ pressed }) => [
            styles.settingsButton,
            pressed ? styles.settingsButtonPressed : null,
          ]}
        >
          <Text style={styles.settingsButtonText}>⚙</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    textContainer: {
      flex: 1,
    },
    title: {
      fontSize: fontSize.title,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      marginTop: spacing.xs,
      fontSize: fontSize.body,
      lineHeight: 22,
      color: colors.textMuted,
    },
    settingsButton: {
      ...touchTargetStyle,
      marginLeft: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    settingsButtonPressed: {
      backgroundColor: colors.subtleGreen,
    },
    settingsButtonText: {
      fontSize: fontSize.heading,
      color: colors.primary,
    },
  });

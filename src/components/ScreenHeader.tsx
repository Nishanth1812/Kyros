import { StyleSheet, Text, View } from 'react-native';

import { useThemedStyles } from '../theme/ThemeContext';
import { type ThemeColors, fontSize, spacing } from '../theme/theme';

export default function ScreenHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      marginBottom: spacing.xl,
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
  });

import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSize, spacing } from '../theme/theme';

export default function ScreenHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
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

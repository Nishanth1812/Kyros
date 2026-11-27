import type { ViewStyle } from 'react-native';

import { minTouchTarget, spacing } from './theme';

/** Spread into interactive control styles on the primary tabs and Settings. */
export const touchTargetStyle: ViewStyle = {
  minHeight: minTouchTarget,
  minWidth: minTouchTarget,
};

export const responsivePageWidthStyle: ViewStyle = {
  alignSelf: 'center',
  width: '100%',
  maxWidth: 760,
};

export const responsivePageContentStyle: ViewStyle = {
  ...responsivePageWidthStyle,
  flexGrow: 1,
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xxl,
};

import type { ViewStyle } from 'react-native';

import { spacing } from './theme';

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

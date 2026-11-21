/** Central visual language for Kyros 0.1. Used by every screen and component. */
export const colors = {
  primary: '#0B3D2E',
  primaryDark: '#062A20',
  accent: '#F2B544',
  surface: '#FFFFFF',
  background: '#F4F7F4',
  text: '#16251F',
  textMuted: '#4F6159',
  border: '#D7E1DA',
  income: '#1B7A54',
  expense: '#B24135',
  danger: '#B3261E',
  errorBackground: '#FDECEA',
  onPrimary: '#FFFFFF',
  subtleGreen: '#E7F2EB',
  subtleRed: '#FBEDEA',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const fontSize = {
  caption: 12,
  small: 13,
  body: 16,
  label: 15,
  heading: 20,
  title: 26,
} as const;

export const elevation = {
  shadowColor: '#0B3D2E',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 6,
  elevation: 3,
} as const;

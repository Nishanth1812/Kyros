/**
 * Central visual language for Kyros.
 *
 * `lightColors` is the shipped palette; `darkColors` is its dark counterpart
 * consumed through `src/theme/ThemeContext.tsx`. The legacy tokens (`text`,
 * `textMuted`, `danger`, …) are kept so screens that have not migrated to the
 * themed-styles rollout keep compiling and rendering with the light palette.
 */

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeColors {
  /* Design-spec tokens (Pillar 4, 2026-11-24 expansion design). */
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  expense: string;
  income: string;
  warning: string;
  /* Legacy tokens retained for the screens pending the themed-styles rollout. */
  text: string;
  textMuted: string;
  danger: string;
  onPrimary: string;
  subtleGreen: string;
  subtleRed: string;
  subtleWarning: string;
  errorBackground: string;
  accent: string;
  primaryDark: string;
}

/**
 * Light palette.
 *
 * Deviations from the design-spec table, all forced by the contrast contract
 * (AAA, >= 7:1, for `textPrimary`/`textSecondary` on `background` and
 * `surface`; AA, >= 4.5:1, for `income`/`expense` because they are rendered as
 * amount text):
 * - `textSecondary` `#64748B` (slate-500) reaches only 4.76:1 on white, so it
 *   is darkened one step to slate-600 `#475569` (7.58:1 on surface, 7.24:1 on
 *   background).
 * - `income` `#16A34A` reaches only 3.30:1 on white, so it uses `#15803D`
 *   (green-700, 5.02:1). `expense` `#DC2626` already clears AA at 4.83:1.
 * - `danger` is the error foreground: `#B91C1C` keeps error text readable on
 *   `errorBackground`/`subtleRed` (5.67:1) where the lighter spec red failed.
 */
export const lightColors: ThemeColors = {
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  border: '#E2E8F0',
  primary: '#2563EB',
  expense: '#DC2626',
  income: '#15803D',
  warning: '#D97706',

  text: '#0F172A',
  textMuted: '#475569',
  danger: '#B91C1C',
  onPrimary: '#FFFFFF',
  subtleGreen: '#E7F2EB',
  subtleRed: '#FBEDEA',
  subtleWarning: '#FEF3C7',
  errorBackground: '#FBEDEA',
  accent: '#D97706',
  primaryDark: '#1D4ED8',
};

/**
 * Dark palette.
 *
 * Deviations from the design-spec table:
 * - `textSecondary` `#94A3B8` (slate-400) reaches only 5.70:1 on the dark
 *   `surface`, so it is lifted to `#B7C3D3` (8.19:1 on surface, 10.0:1 on
 *   background).
 * - `primary` `#3B82F6` reaches only 3.98:1 on the dark `surface`, which is
 *   too weak for tinted labels and for `onPrimary` text on a primary button;
 *   `#60A5FA` (blue-400) gives 5.75:1 on surface, 7.0:1 on background, and
 *   7.0:1 for the dark `onPrimary` it carries.
 * - `border` `#334155` is identical to `surfaceElevated` and only 1.41:1 on
 *   `surface`, effectively invisible; `#475569` restores a readable edge.
 * - `expense` `#EF4444` reaches only 3.89:1 on the dark `surface`, so it uses
 *   `#F87171` (5.29:1). `income` `#22C55E` already clears AA at 6.42:1.
 * - `danger` is the error foreground: `#FCA5A5` on `errorBackground`
 *   `#3B1418` reads at 8.5:1.
 * - `subtleGreen`/`subtleRed` are dark tints of the same hues so selected
 *   chips and error banners do not glow white in dark mode.
 */
export const darkColors: ThemeColors = {
  background: '#0F172A',
  surface: '#1E293B',
  surfaceElevated: '#334155',
  textPrimary: '#F8FAFC',
  textSecondary: '#B7C3D3',
  border: '#475569',
  primary: '#60A5FA',
  expense: '#F87171',
  income: '#22C55E',
  warning: '#F59E0B',

  text: '#F8FAFC',
  textMuted: '#B7C3D3',
  danger: '#FCA5A5',
  onPrimary: '#0F172A',
  subtleGreen: '#12283D',
  subtleRed: '#3B1418',
  subtleWarning: '#3B2D14',
  errorBackground: '#3B1418',
  accent: '#F59E0B',
  primaryDark: '#93C5FD',
};

/**
 * Backward-compatible alias: screens and components that have not migrated to
 * `useThemedStyles` keep importing `colors` and render the light palette.
 */
export const colors: ThemeColors = lightColors;

function channelToLinear(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const value = hex.trim();
  const match = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (!match) {
    throw new RangeError(`Expected a #RRGGBB colour, received "${hex}".`);
  }
  const digits = match[1];
  const red = channelToLinear(Number.parseInt(digits.slice(0, 2), 16));
  const green = channelToLinear(Number.parseInt(digits.slice(2, 4), 16));
  const blue = channelToLinear(Number.parseInt(digits.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** WCAG 2.x contrast ratio between two `#RRGGBB` colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

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

/**
 * Minimum interactive target (48 dp), derived from the body text size and two
 * generous spacing steps. Shared through `layout.touchTargetStyle` so the
 * primary screens and Settings cannot silently shrink their controls.
 */
export const minTouchTarget = fontSize.body + spacing.xxl;

/** Neutral shadow so the same elevation reads on both palettes. */
export const elevation = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 6,
  elevation: 3,
} as const;

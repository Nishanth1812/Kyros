import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, type ColorSchemeName } from 'react-native';

import { getDatabaseInstance } from '../lib/database';
import {
  createSettingsStorage,
  type SettingsStorage,
} from '../storage/settingsStorage';
import {
  darkColors,
  lightColors,
  type ThemeColors,
  type ThemeMode,
} from './theme';

/** `app_settings` key that stores the user's chosen theme mode. */
export const THEME_MODE_SETTING_KEY = 'themeMode';

export interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

let settingsStoragePromise: Promise<SettingsStorage> | null = null;

/**
 * Settings share the single open database connection with the rest of the
 * app, so the theme can be restored before the first paint of any screen.
 */
function getSettingsStorage(): Promise<SettingsStorage> {
  if (!settingsStoragePromise) {
    settingsStoragePromise = getDatabaseInstance()
      .then((db) => createSettingsStorage(db))
      .catch((error: unknown) => {
        settingsStoragePromise = null;
        throw error;
      });
  }
  return settingsStoragePromise;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName | null>(() =>
    Appearance.getColorScheme()
  );

  // Restore the persisted choice once; a storage failure keeps 'system'.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const storage = await getSettingsStorage();
        const saved = await storage.getSetting(THEME_MODE_SETTING_KEY);
        if (active && isThemeMode(saved)) {
          setModeState(saved);
        }
      } catch {
        // Keep the 'system' default rather than blocking startup.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // When the user follows the system, device changes apply immediately.
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void (async () => {
      try {
        const storage = await getSettingsStorage();
        await storage.setSetting(THEME_MODE_SETTING_KEY, next);
      } catch {
        // The choice still applies for this session.
      }
    })();
  }, []);

  const isDark =
    mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      colors: isDark ? darkColors : lightColors,
      isDark,
      setMode,
    }),
    [mode, isDark, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error('useTheme must be used inside a ThemeProvider.');
  }
  return value;
}

/**
 * Themed StyleSheet factory used by screens and components:
 *
 * ```ts
 * const createStyles = (colors: ThemeColors) =>
 *   StyleSheet.create({ screen: { backgroundColor: colors.background } });
 *
 * export default function Screen() {
 *   const styles = useThemedStyles(createStyles);
 *   ...
 * }
 * ```
 *
 * Declare `createStyles` at module scope: the result is memoized by palette
 * identity, so an inline factory would rebuild the styles on every render.
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}

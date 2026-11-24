import { describe, expect, test } from 'bun:test';

import { initializeSchema } from '../src/storage/schema';
import { createSettingsStorage } from '../src/storage/settingsStorage';
import {
  colors,
  contrastRatio,
  darkColors,
  elevation,
  lightColors,
  type ThemeColors,
} from '../src/theme/theme';
import { createBunSqliteAdapter } from './helpers/bunSqliteAdapter';

const AAA_CONTRAST = 7;

const palettes: ReadonlyArray<readonly [string, ThemeColors]> = [
  ['light', lightColors],
  ['dark', darkColors],
];

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

describe('Dynamic theme palette', () => {
  test('test_theme_palettes_provide_wcag_aaa_contrast_for_text', () => {
    for (const [name, palette] of palettes) {
      for (const textToken of ['textPrimary', 'textSecondary'] as const) {
        for (const surfaceToken of ['background', 'surface'] as const) {
          const ratio = contrastRatio(palette[textToken], palette[surfaceToken]);
          if (ratio < AAA_CONTRAST) {
            throw new Error(
              `${name} ${textToken} on ${surfaceToken} is ${ratio.toFixed(2)}:1, below AAA (${AAA_CONTRAST}:1).`
            );
          }
          expect(ratio).toBeGreaterThanOrEqual(AAA_CONTRAST);
        }
      }
    }
  });

  test('test_theme_palettes_expose_identical_token_sets_as_hex_colours', () => {
    expect(Object.keys(lightColors).sort()).toEqual(Object.keys(darkColors).sort());

    for (const token of Object.keys(lightColors) as Array<keyof ThemeColors>) {
      expect(lightColors[token]).toMatch(HEX_COLOR_RE);
      expect(darkColors[token]).toMatch(HEX_COLOR_RE);
    }

    // Design-spec tokens and the legacy aliases agree with their semantic pair.
    expect(lightColors.text).toBe(lightColors.textPrimary);
    expect(lightColors.textMuted).toBe(lightColors.textSecondary);
    expect(darkColors.text).toBe(darkColors.textPrimary);
    expect(darkColors.textMuted).toBe(darkColors.textSecondary);
  });

  test('test_legacy_colors_export_stays_the_light_palette', () => {
    expect(colors).toBe(lightColors);
    expect(colors.primary).not.toBe(colors.surface);
    expect(colors.text).not.toBe(colors.background);
  });

  test('test_elevation_uses_a_neutral_shadow_readable_in_both_modes', () => {
    expect(elevation.shadowColor).toBe('#000000');
  });
});

describe('Theme settings storage', () => {
  test('test_app_settings_table_is_created_on_already_v4_databases', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    try {
      await initializeSchema(db);
      // Simulate a database that reached v4 before settings existed.
      await db.execAsync('DROP TABLE app_settings;');

      await initializeSchema(db);

      const tables = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='app_settings';"
      );
      expect(tables).toHaveLength(1);

      const version = await db.getFirstAsync<{ user_version: number }>(
        'PRAGMA user_version;'
      );
      expect(version?.user_version).toBe(4);

      // Running it again is idempotent and leaves the default value untouched.
      await initializeSchema(db);
      const storage = createSettingsStorage(db);
      expect(await storage.getSetting('themeMode')).toBeNull();
    } finally {
      close();
    }
  });

  test('test_settings_storage_round_trips_and_overwrites_values', async () => {
    const { db, close } = createBunSqliteAdapter(':memory:');
    try {
      const storage = createSettingsStorage(db);
      expect(await storage.getSetting('themeMode')).toBeNull();

      await storage.setSetting('themeMode', 'dark');
      expect(await storage.getSetting('themeMode')).toBe('dark');

      await storage.setSetting('themeMode', 'system');
      expect(await storage.getSetting('themeMode')).toBe('system');

      const rows = await db.getAllAsync<{ key: string; value: string }>(
        'SELECT key, value FROM app_settings;'
      );
      expect(rows).toEqual([{ key: 'themeMode', value: 'system' }]);

      await storage.setSetting('unrelated', 'kept');
      expect(await storage.getSetting('themeMode')).toBe('system');
      expect(await storage.getSetting('unrelated')).toBe('kept');
    } finally {
      close();
    }
  });
});

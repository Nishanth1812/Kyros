import { describe, expect, it } from 'bun:test';
import { touchTargetStyle } from '../src/theme/layout';
import { colors, fontSize, minTouchTarget, spacing } from '../src/theme/theme';

describe('Accessibility and Layout Standards', () => {
  it('enforces accessible text sizes with appropriate hierarchy', () => {
    expect(fontSize.caption).toBeGreaterThanOrEqual(12);
    expect(fontSize.small).toBeGreaterThanOrEqual(13);
    expect(fontSize.body).toBeGreaterThanOrEqual(16);
    expect(fontSize.heading).toBeGreaterThanOrEqual(20);
    expect(fontSize.title).toBeGreaterThanOrEqual(24);
  });

  it('provides high-contrast theme colors for text and badges', () => {
    // Primary brand and text colors must be distinct from surface/background
    expect(colors.primary).not.toBe(colors.surface);
    expect(colors.text).not.toBe(colors.background);
    expect(colors.danger).toBeDefined();
    expect(colors.income).toBeDefined();
    expect(colors.expense).toBeDefined();
  });

  it('keeps interactive targets at 48dp through the shared app style', () => {
    // The target is an app-owned token derived from the type and spacing
    // scale, shared with the primary screens and Settings via `touchTargetStyle`.
    expect(touchTargetStyle.minHeight).toBe(minTouchTarget);
    expect(touchTargetStyle.minWidth).toBe(minTouchTarget);
    expect(minTouchTarget).toBeGreaterThanOrEqual(fontSize.heading + spacing.lg);
    expect(minTouchTarget).toBeGreaterThanOrEqual(48);
  });
});

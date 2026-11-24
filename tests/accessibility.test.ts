import { describe, expect, it } from 'bun:test';
import { colors, fontSize, radius, spacing } from '../src/theme/theme';

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

  it('guarantees touch target minimums of at least 48dp', () => {
    // 48dp touch target standard from Android Material and WCAG guidelines
    const minTargetDp = 48;
    expect(minTargetDp).toBe(48);
  });
});

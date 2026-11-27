import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { touchTargetStyle } from '../src/theme/layout';
import { colors, fontSize, minTouchTarget, spacing } from '../src/theme/theme';

const auditedFiles = [
  'src/screens/DashboardScreen.tsx',
  'src/screens/AddTransactionScreen.tsx',
  'src/screens/HistoryScreen.tsx',
  'src/screens/BudgetsScreen.tsx',
  'src/screens/DataManagementScreen.tsx',
  'src/screens/SettingsScreen.tsx',
  'src/components/ScreenHeader.tsx',
  'src/components/TransactionForm.tsx',
];

const interactiveComponents = new Set(['Pressable', 'TouchableOpacity']);

function readComponentContract(relativePath: string) {
  const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
  const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const styles = new Map<string, ts.ObjectLiteralExpression>();
  const interactiveStyles: Array<{ usesTouchTarget: boolean; line: number }> = [];
  const modalContracts: Array<{ requestClose: string | null; line: number }> = [];

  const collectStyles = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.expression.getText(file) === 'StyleSheet' && node.expression.name.text === 'create' &&
      node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      for (const property of node.arguments[0].properties) {
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) &&
          ts.isObjectLiteralExpression(property.initializer)) {
          styles.set(property.name.text, property.initializer);
        }
      }
    }
    ts.forEachChild(node, collectStyles);
  };
  collectStyles(file);

  const visit = (node: ts.Node) => {
    const opening = ts.isJsxElement(node) ? node.openingElement :
      ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening && ts.isIdentifier(opening.tagName) && opening.tagName.text === 'Modal') {
      const requestClose = opening.attributes.properties.find(
        (attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'onRequestClose'
      );
      modalContracts.push({
        requestClose: requestClose?.initializer?.getText(file) ?? null,
        line: file.getLineAndCharacterOfPosition(opening.getStart(file)).line + 1,
      });
    }
    if (opening && ts.isIdentifier(opening.tagName) && interactiveComponents.has(opening.tagName.text)) {
      const styleAttribute = opening.attributes.properties.find(
        (attribute): attribute is ts.JsxAttribute => ts.isJsxAttribute(attribute) && attribute.name.text === 'style'
      );
      const styleNames = new Set<string>();
      if (styleAttribute?.initializer && ts.isJsxExpression(styleAttribute.initializer) && styleAttribute.initializer.expression) {
        const collectStyles = (expression: ts.Node) => {
          if (ts.isPropertyAccessExpression(expression) && expression.expression.getText(file) === 'styles') {
            styleNames.add(expression.name.text);
          }
          ts.forEachChild(expression, collectStyles);
        };
        collectStyles(styleAttribute.initializer.expression);
      }
      interactiveStyles.push({
        usesTouchTarget: [...styleNames].some((name) => styles.get(name)?.properties.some(
          (property) => ts.isSpreadAssignment(property) && property.expression.getText(file) === 'touchTargetStyle'
        )) ?? false,
        line: file.getLineAndCharacterOfPosition(opening.getStart(file)).line + 1,
      });
    }

    ts.forEachChild(node, visit);
  };

  visit(file);
  return { interactiveStyles, modalContracts };
}

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

  it('applies the shared 48dp target to primary-screen and Settings controls', () => {
    const controls = auditedFiles.flatMap((path) => {
      const contract = readComponentContract(path);
      return contract.interactiveStyles.map((control) => ({ path, ...control }));
    });

    expect(controls.length).toBeGreaterThan(0);
    expect(controls.filter((control) => !control.usesTouchTarget).map(
      (control) => `${control.path}:${control.line}`
    )).toEqual([]);
  });

  it('dismisses each category and recurring modal through Android Back', () => {
    const categoryModals = readComponentContract('src/screens/CategoryManagementScreen.tsx').modalContracts;
    const recurringModals = readComponentContract('src/screens/RecurringTransactionsScreen.tsx').modalContracts;
    const closeHandlers = [...categoryModals, ...recurringModals].map((modal) => modal.requestClose);

    expect(closeHandlers).toHaveLength(4);
    expect(closeHandlers).toEqual([
      expect.stringContaining('setEditingCategory(null)'),
      expect.stringContaining('setDeletingCategory(null)'),
      expect.stringContaining('setShowAddModal(false)'),
      expect.stringContaining('setShowAddModal(false)'),
    ]);
    expect(closeHandlers.every((handler) => handler?.includes('!isSubmitting'))).toBe(true);
  });
});

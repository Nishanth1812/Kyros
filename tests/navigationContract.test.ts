import { describe, expect, it } from 'bun:test';

import {
  PRIMARY_TAB_ROUTES,
  ROOT_STACK_ROUTES,
} from '../src/navigation/types';

describe('Task 4 navigation contract', () => {
  it('keeps exactly the five primary bottom tab destinations', () => {
    expect([...PRIMARY_TAB_ROUTES]).toEqual([
      'Dashboard',
      'Add',
      'History',
      'Budgets',
      'Data',
    ]);
  });

  it('registers every secondary destination on the root stack', () => {
    expect([...ROOT_STACK_ROUTES]).toEqual([
      'MainTabs',
      'Analytics',
      'Settings',
      'RecurringTransactions',
      'FinancialGoals',
      'CategoryManagement',
    ]);
  });

  it('keeps Settings off the tab bar and reachable as a stack route', () => {
    expect(PRIMARY_TAB_ROUTES).not.toContain('Settings');
    expect(ROOT_STACK_ROUTES).toContain('Settings');
  });
});

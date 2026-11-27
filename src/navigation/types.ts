import type { MonthScope } from '../lib/analytics';

/** The five bottom destinations kept across the 1.0 navigation change. */
export type RootTabParamList = {
  Dashboard: undefined;
  Add: undefined;
  History: undefined;
  Budgets: undefined;
  Data: undefined;
};

/**
 * Root stack around the tabs. Secondary screens are routes so Android system
 * Back returns to the screen that opened them. Analytics keeps the optional
 * month scope already passed by Dashboard.
 */
export type RootStackParamList = {
  MainTabs: undefined;
  Analytics: { initialScope?: MonthScope } | undefined;
  Settings: undefined;
  RecurringTransactions: undefined;
  FinancialGoals: undefined;
  CategoryManagement: undefined;
};

/** Single source of truth for the tab bar; mirrored by the tab navigator. */
export const PRIMARY_TAB_ROUTES = [
  'Dashboard',
  'Add',
  'History',
  'Budgets',
  'Data',
] as const satisfies ReadonlyArray<keyof RootTabParamList>;

/** Single source of truth for the root stack; mirrored by the stack navigator. */
export const ROOT_STACK_ROUTES = [
  'MainTabs',
  'Analytics',
  'Settings',
  'RecurringTransactions',
  'FinancialGoals',
  'CategoryManagement',
] as const satisfies ReadonlyArray<keyof RootStackParamList>;

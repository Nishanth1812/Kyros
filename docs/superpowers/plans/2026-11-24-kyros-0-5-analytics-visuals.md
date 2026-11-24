# Kyros 0.5 Enhanced Analytics and Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task by task. Use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Kyros 0.5 with visual analytics, category distribution charts, multi-month income/expense trends, historical month reviews on Dashboard and a dedicated Analytics screen, and CSV transaction reports via Storage Access Framework.

**Architecture:** Pure TypeScript analytical calculators deriving metrics, averages, and historical trends on-the-fly from saved SQLite transactions in `TransactionsContext`. Lightweight, accessible custom React Native chart components built with flexbox and core styling. CSV serializer adhering to RFC 4180 exported via existing native `KyrosFileModule`.

**Tech Stack:** React Native 0.88, TypeScript 6, React Navigation bottom tabs & stack/modal, Android SQLite & SAF modules, Bun tests, Gradle, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-24-kyros-0-5-analytics-visuals-design.md`

## Global Constraints

- Android remains the supported platform, minimum Android 7.0 (API 24).
- All financial calculations are derived directly from SQLite transactions using integer paise without rounding.
- Zero extra third-party npm chart libraries; charts are implemented cleanly with React Native core components (`View`, `Text`, `StyleSheet`).
- Every interactive element maintains a minimum touch target size of 48×48 dp.
- Visual elements and charts must provide comprehensive `accessibilityRole` and `accessibilityLabel` attributes for screen readers.
- CSV export generates RFC 4180 compliant CSV files with formatted rupee amounts and escaped text.

## Review Focus

- **Month boundary accuracy:** Date slicing accurately includes all transactions within local calendar month boundaries (day 1 00:00 through month end).
- **Chart accessibility:** Screen reader users hear complete data summaries (e.g., "Food: 45% of total expenses, ₹12,500.00").
- **Proportional chart layout:** Category bar widths and trend bar heights scale proportionally between 0% and 100% without overflow or layout jitter.
- **CSV formatting:** Commas, quotes, and newlines in transaction descriptions are properly escaped according to RFC 4180.

---

### Task 1: Analytics aggregation engine and CSV serialization — issue #40

**Files:**
- Create: `src/lib/analytics.ts`
- Create: `src/lib/csvExport.ts`
- Create: `tests/analytics.test.ts`
- Create: `tests/csvExport.test.ts`

**Interfaces:**
- `MonthScope { year: number; month: number; label: string; dateFrom: string; dateTo: string }`
- `CategorySpendingBreakdown { categoryId: number; name: string; type: 'income' | 'expense'; amountMinor: number; percentage: number; color?: string }`
- `MonthlyTrendDataPoint { year: number; month: number; label: string; incomeMinor: number; expenseMinor: number; netMinor: number }`
- `calculateMonthAnalytics(transactions: Transaction[], categories: Category[], scope: MonthScope)`
- `calculateMultiMonthTrends(transactions: Transaction[], monthsCount: number, referenceDate?: Date): MonthlyTrendDataPoint[]`
- `formatTransactionsToCsv(transactions: Transaction[], categories: Category[]): string`

- [x] **Step 1: Write analytics engine unit tests**
  Add unit tests in `tests/analytics.test.ts` checking: correct month boundary filtering, category percentage breakdown summing to 100%, daily average spend calculation, empty month handling, and multi-month trend calculations.

- [x] **Step 2: Write CSV export unit tests**
  Add unit tests in `tests/csvExport.test.ts` checking: header generation, row formatting with formatted rupee values, escaping descriptions containing commas/quotes/newlines, and category mapping.

- [x] **Step 3: Implement analytics calculation functions**
  Implement `src/lib/analytics.ts` with date navigation helpers, category breakdown aggregators, and multi-month trend computations.

- [x] **Step 4: Implement CSV serialization**
  Implement `src/lib/csvExport.ts` adhering to RFC 4180.

- [x] **Step 5: Run tests and typecheck**
  Run: `bun test tests/analytics.test.ts tests/csvExport.test.ts` and `npm run typecheck`.

---

### Task 2: Accessible visual chart components — issue #41

**Files:**
- Create: `src/components/CategoryBreakdownChart.tsx`
- Create: `src/components/MonthlyTrendChart.tsx`
- Create: `tests/chartComponents.test.ts`

**Interfaces:**
- `<CategoryBreakdownChart breakdown={CategorySpendingBreakdown[]} totalMinor={number} />`
- `<MonthlyTrendChart trends={MonthlyTrendDataPoint[]} onSelectMonth?: (point: MonthlyTrendDataPoint) => void />`

- [ ] **Step 1: Implement CategoryBreakdownChart**
  Build horizontal proportional distribution bar with colored segments and an accessible list of ranked categories showing percentage and formatted amount. Ensure full screen reader accessibility.

- [ ] **Step 2: Implement MonthlyTrendChart**
  Build 6-month paired bar chart (Income in green, Expense in red) with proportional heights, month labels, and tap/touch targets for each bar.

- [ ] **Step 3: Add component tests**
  Add tests in `tests/chartComponents.test.ts` checking accessibility labels and proportional percentage calculations.

- [ ] **Step 4: Run tests and typecheck**
  Run: `bun test tests/chartComponents.test.ts` and `npm run typecheck`.

---

### Task 3: Month navigation on Dashboard and dedicated Analytics screen — issue #42

**Files:**
- Create: `src/screens/AnalyticsScreen.tsx`
- Modify: `src/screens/DashboardScreen.tsx`
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/AppNavigator.tsx`
- Create: `tests/monthNavigation.test.ts`

- [ ] **Step 1: Add MonthSelector component / controls to Dashboard**
  Add previous/next month controls to `DashboardScreen.tsx`. Update dashboard summaries and categories to reflect the selected month. Add a quick link to open full Analytics.

- [ ] **Step 2: Implement AnalyticsScreen**
  Build `AnalyticsScreen.tsx` featuring the 6-month trend chart, selected month deep dive (daily average, top category, savings rate), and the complete category breakdown chart.

- [ ] **Step 3: Update Navigation**
  Add `Analytics: undefined` route to navigation so users can navigate to the dedicated Analytics view.

- [ ] **Step 4: Add month navigation tests**
  Add unit tests in `tests/monthNavigation.test.ts` checking navigation bounds and date shifts.

- [ ] **Step 5: Run tests and typecheck**
  Run: `bun test` and `npm run typecheck`.

---

### Task 4: CSV Export flow in Data tab — issue #43

**Files:**
- Modify: `src/screens/DataManagementScreen.tsx`
- Modify: `tests/dataManagementScreen.test.ts`

- [ ] **Step 1: Add CSV Export button to DataManagementScreen**
  Add "Export Transactions as CSV" button under the Backup & Recovery card. Format transactions using `formatTransactionsToCsv`, generate `kyros-transactions-YYYY-MM-DD.csv`, and save using `defaultFileBridge.saveBackupFile`.

- [ ] **Step 2: Add feedback banners and accessibility**
  Show success banner with transaction count on export; display error message if cancelled or failed.

- [ ] **Step 3: Run tests and typecheck**
  Run: `bun test` and `npm run typecheck`.

---

### Task 5: Release preparation, documentation, and build checks — issue #44

**Files:**
- Modify: `package.json` (bump version to 0.5.0)
- Modify: `android/app/build.gradle` (bump versionCode to 7, versionName to "0.5.0")
- Create: `release-notes/v0.5.0.md`
- Modify: `README.md`
- Modify: `plan.md`

- [ ] **Step 1: Update version numbers**
  Update version in `package.json` and `android/app/build.gradle`.

- [ ] **Step 2: Write release notes**
  Create `release-notes/v0.5.0.md` detailing analytics, visual charts, month navigation, and CSV export.

- [ ] **Step 3: Update README and roadmap**
  Update `README.md` and `plan.md` to reflect 0.5 capabilities.

- [ ] **Step 4: Verify test suite and typecheck**
  Run full test suite: `bun test`
  Run typecheck: `npm run typecheck`

---

### Task 6: Published GitHub wiki review and verification — issue #45

**Scope:**
- Review existing GitHub wiki pages against Kyros 0.5.0 changes.
- Update pages covering Analytics, Month Navigation, and CSV export.
- Verify published wiki pages after release to `main`.

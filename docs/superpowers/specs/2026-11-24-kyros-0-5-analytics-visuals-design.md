# Kyros 0.5 Enhanced Analytics and Visuals Design

## Intent

Kyros 0.5 enhances spending understanding and financial visibility with visual analytics, category distribution charts, historical month navigation, and CSV transaction reports. It lets users explore how their spending evolves over time, compare historical calendar months, and export spreadsheet-ready reports without sacrificing the offline, local-first SQLite foundation.

## Goals

- Add historical calendar month navigation (previous/next month, jump to current month) to review past earnings and expenditures.
- Introduce visual category breakdown charts showing proportional distribution, exact amounts, and percentages for any selected month.
- Provide a multi-month spending trend overview (e.g., last 6 months income vs. expense comparison) to visualize financial trajectories.
- Deliver a dedicated Analytics screen linked from the Dashboard for deep-dive category and trend exploration.
- Add CSV transaction export via Android's Storage Access Framework (SAF) in the Data tab.
- Build visual chart components purely using React Native core components (zero extra npm or native dependencies), ensuring total reliability, accessibility, and high performance.
- Preserve all existing invariants: integer-paise financial precision, offline local SQLite storage, accessibility labels, and >= 48dp touch targets.

## Non-goals

- Remote analytics services, telemetry, or cloud database storage.
- Complex third-party chart libraries (custom React Native flex-based bar and trend components avoid dependency bloat and platform incompatibilities).
- Predictive or automated budgeting AI.

## Constraints and Invariants

- Android minimum version remains Android 7.0 (API 24).
- All calculations are derived on-the-fly from saved SQLite transactions; balance or summary values are never stored as redundant database records.
- Money calculations use checked integer arithmetic in minor units (paise).
- CSV export generates UTF-8 comma-separated files adhering to RFC 4180 with standard headers (`Date`, `Type`, `Category`, `Amount (INR)`, `Description`).
- Zero new third-party npm packages.
- Accessibility: Every chart and visual element must provide comprehensive `accessibilityLabel` and `accessibilityRole` attributes summarizing values for screen readers.

## Proposed Experience

### 1. Month Navigation on Dashboard & Analytics
- Header includes month navigation controls:
  - `◀` Previous Month button (minHeight/minWidth 48dp).
  - Month & Year label (e.g., "November 2026").
  - `▶` Next Month button (disabled if on current month, preventing future month navigation without data).
  - "Today" / "Current Month" badge when viewing a past month to quickly return.
- Updating the selected month dynamically recalculates net balance, income/expense totals, and category breakdown for that specific local calendar month.

### 2. Category Spending Breakdown Visuals
- Horizontal stacked or segmented distribution bar showing top expense categories by percentage.
- Categorized list showing category name, colored badge, percentage of total monthly spending, and formatted currency amount.

### 3. Multi-Month Spending Trend Chart
- A clean, accessible bar chart displaying the last 6 calendar months:
  - Paired or stacked bars for Income vs. Expense.
  - Relative height scaling with formatted axis labels.
  - Tap/focus on a month bar reveals exact income and expense figures.

### 4. Dedicated Analytics Screen
- Accessible via a prominent "Insights & Analytics" card/button on the Dashboard.
- Features:
  - 6-month historical overview.
  - Selected month deep dive: daily average spend, top expense category, and savings rate.
  - Full breakdown of expenses and income by category.

### 5. CSV Export in Data Tab
- In the Data tab, an "Export Transactions as CSV" button alongside the JSON backup options.
- Generates `kyros-transactions-YYYY-MM-DD.csv` via `KyrosFileModule` (SAF).
- Allows users to open and analyze their transactions in Excel, Google Sheets, or personal accounting tools.

## Delivery Slices

1. **Slice 1: Analytics and aggregation engine & CSV exporter**
   - Pure functions in `src/lib/analytics.ts` and `src/lib/csvExport.ts`: month navigation helpers, multi-month summaries, category percentages, daily averages, and RFC 4180 CSV serialization. Comprehensive Bun unit tests.
2. **Slice 2: Accessible visual chart components**
   - `CategoryBreakdownChart`: horizontal proportional bar and ranked category breakdown with accessible labels.
   - `MonthlyTrendChart`: multi-month income vs expense bar chart with value callouts and accessibility summaries.
3. **Slice 3: Dashboard month navigation & Analytics screen**
   - Add month selector to Dashboard.
   - Build `AnalyticsScreen` displaying trend charts, category distributions, and daily metrics.
   - Register navigation routes.
4. **Slice 4: CSV Export in Data tab & Storage Access Framework integration**
   - Integrate CSV file export in `DataManagementScreen` via `defaultFileBridge`.
5. **Slice 5: Release preparation, documentation, and build checks**
   - Bump version to `0.5.0`, author release notes (`release-notes/v0.5.0.md`), update `README.md` and `plan.md`.
6. **Slice 6: Published GitHub wiki review and verification**
   - Update wiki pages with Analytics, Month Navigation, and CSV export guidance after main release.

## Release Acceptance

- Selecting past months recalculates Dashboard and Analytics figures accurately matching saved transactions.
- Category breakdown percentages sum to 100% and amounts match transaction totals.
- 6-month trend chart accurately shows income and expense bars with accessible labels.
- CSV export generates valid, properly escaped CSV files accepted by standard spreadsheet software.
- All unit tests pass (`bun test`).
- TypeScript checks pass (`npm run typecheck`).

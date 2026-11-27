# Kyros 1.0 Product Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Kyros’s UI, financial analytics, Settings, accessibility, and measured performance before releasing version 1.0.

**Architecture:** Keep SQLite as the local source of financial data and keep the existing five bottom tabs. Add secondary routes through React Navigation’s native stack, move existing appearance controls into Settings, and improve existing screens and chart components using the current theme. Change analytics and backup metadata at their responsible domain/storage boundaries; profile before making performance changes.

**Tech Stack:** React Native 0.88.1, TypeScript 6, React Navigation 7, Android API 24+, SQLite, Bun tests, Android device profiling.

**Spec:** [`docs/superpowers/specs/2026-11-27-kyros-1-0-product-readiness-design.md`](../specs/2026-11-27-kyros-1-0-product-readiness-design.md)

## Global Constraints

- Android remains the supported platform with minimum API 24.
- SQLite remains the source of truth; amounts remain integer paise.
- No account, cloud sync, backend, remote storage, product telemetry, database schema change, or chart dependency.
- Keep Dashboard, Add, History, Budgets, and Data as the five bottom destinations.
- Keep existing input validation, transactional restore behavior, and cancellation/data-loss safeguards.
- New backup exports use the authoritative app version; older backups remain restorable.
- Use the current theme tokens and installed packages; add a navigation package only for the required native stack behavior.
- Commit each completed slice separately with concise, plain-language messages.

## Review Focus

- **Zero income or a deficit:** savings rate must be unavailable at zero income and negative when expenses exceed income. Pin both in `tests/analytics.test.ts`.
- **Old backups:** 0.6.x backups must still validate and restore without schema changes. Keep coverage in `tests/backupValidation.test.ts` and `tests/backupStorage.test.ts`.
- **Navigation and access:** Settings and secondary routes must return to the originating screen with Android Back; screen-reader labels and 48 dp targets must remain usable. Verify with an Android device smoke pass.
- **Small screens and large text:** layouts must remain readable without clipping or hiding actions. Verify on Android at narrow width and increased font size.
- **Large transaction sets:** performance changes must be justified by same-device, same-build, same-data before/after profiling. Record the device and dataset; do not infer a runtime result from unit-test timing.

## Execution Protocol

- Use OpenCode `opencode/hy4-flash-free` for independent implementation slices, one task at a time in the shared checkout; the primary agent integrates, reviews each diff, and commits each accepted slice.
- Tidepool Alpha was unavailable when requested. Use Hy4 Flash only; do not substitute another model without a new request.
- The primary agent owns Android device profiling and final release integration. No Android emulator or device is currently available on this machine, so the profiling and device-verification tasks remain pending until one is available.
- Execute Task 3 before any source edits in Tasks 1, 2, and 4–7 so the baseline describes the current app. If no device is available, record that state and continue without performance claims or speculative optimization.
- Do not begin implementation until the owner approves this plan.

---

### Task 1: Define savings-rate edge cases

**Files:**
- Modify: `src/lib/analytics.ts`
- Modify: `src/screens/DashboardScreen.tsx`
- Modify: `src/screens/AnalyticsScreen.tsx`
- Test: `tests/analytics.test.ts`

**Interfaces:**
- Produces: `MonthAnalytics.savingsRate: number | null`; positive values retain the existing percent scale, deficits return a negative percent, and zero income returns `null`.

- [ ] **Step 1: Add failing analytics cases**

In `tests/analytics.test.ts`, keep the existing positive-income expectation, add an overspending case expecting a negative rate, and change the empty-month expectation from `0` to `null`. Add a zero-income case with expenses and expect `null`.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `bun test tests/analytics.test.ts`

Expected: failures for the deficit and zero-income results.

- [ ] **Step 3: Update the calculation and its consumers**

In `src/lib/analytics.ts`, return `null` when income is zero; otherwise calculate `Math.round(((income - expenses) / income) * 100)`. Update Dashboard and Analytics to show “Not available” for `null` and the percentage otherwise.

- [ ] **Step 4: Verify the domain behavior and types**

Run: `bun test tests/analytics.test.ts` and `npm run typecheck`

Expected: all analytics cases pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics.ts src/screens/DashboardScreen.tsx src/screens/AnalyticsScreen.tsx tests/analytics.test.ts
git commit -m "Show deficit savings rates accurately"
```

### Task 2: Export the actual app version in backups

**Files:**
- Modify: `src/storage/backupStorage.ts`
- Test: `tests/backupStorage.test.ts`
- Existing compatibility tests: `tests/backupValidation.test.ts`

**Interfaces:**
- Produces: `exportBackupData(db: SQLiteDatabaseLike, appVersion: string = packageJson.version): Promise<KyrosBackupV2>`; the optional override remains available, while the default comes from `package.json`.

- [ ] **Step 1: Add a failing export-version assertion**

In `tests/backupStorage.test.ts`, add `import packageJson from '../package.json'`, keep the no-override export call, and expect `backup.meta.appVersion` to equal `packageJson.version`. This fails against the current hardcoded `0.6.0` default.

- [ ] **Step 2: Run the focused test and confirm the version assertion fails**

Run: `bun test tests/backupStorage.test.ts`

Expected: the export test fails because the current default is `0.6.0` while `package.json` reports `1.0.0`.

- [ ] **Step 3: Use the authoritative package version as the exporter default**

Import `package.json`’s `version` into `src/storage/backupStorage.ts` and use it as the default `appVersion`. Keep the existing optional override. Do not change the backup schema or restore validation.

- [ ] **Step 4: Verify export and restore compatibility**

Run: `bun test tests/backupStorage.test.ts tests/backupValidation.test.ts` and `npm run typecheck`

Expected: new exports carry the `package.json` version, and legacy backup validation and restore tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/storage/backupStorage.ts tests/backupStorage.test.ts
git commit -m "Use the app version in backup metadata"
```

### Task 3: Capture the Android performance baseline

**Files:**
- Create: `docs/superpowers/performance/2026-11-27-kyros-1-0-baseline.md` (measurement record only)

**Interfaces:**
- Produces: a record of Android model/version, build type, dataset size, measurement method, and the median of five runs for cold launch, Dashboard entry, Analytics open/month change, and History search/filter. Use deterministic synthetic datasets of 100 and 10,000 transactions; do not profile personal financial data.

- [ ] **Step 1: Check for a usable Android device**

Call `device_list`; if a device is available, open it with `device_open`, install the current debug build through the existing build path, then use the returned `agent-device` command and `open <app>` before interacting with Kyros. Do not use `adb`, `simctl`, or shell wrappers to drive the UI.

- [ ] **Step 2: Record a reproducible baseline**

Measure the four flows listed in the interface using both synthetic datasets. If no synthetic fixture exists, prepare deterministic data in a throwaway app database and record the generation steps. Record device, OS, build, dataset counts, run count, median result, and any visible frame drops. Do not profile personal data or add product telemetry.

- [ ] **Step 3: Record unavailable hardware without inventing results**

If no Android device is available, record that the baseline is pending and identify the needed device. Continue source-level work, but make no performance claim or speculative performance edit.

- [ ] **Step 4: Commit the measurement record**

Commit only if a measurement record was created; do not create a code change just to satisfy this task.

```bash
git add docs/superpowers/performance/2026-11-27-kyros-1-0-baseline.md
git commit -m "Record the Kyros Android performance baseline"
```

### Task 4: Add Settings and consistent secondary navigation

**Files:**
- Create: `src/screens/SettingsScreen.tsx`
- Modify: `src/navigation/AppNavigator.tsx`
- Modify: `src/navigation/types.ts`
- Modify: `src/components/ScreenHeader.tsx`
- Modify: `src/screens/DashboardScreen.tsx`
- Modify: `src/screens/AddTransactionScreen.tsx`
- Modify: `src/screens/HistoryScreen.tsx`
- Modify: `src/screens/BudgetsScreen.tsx`
- Modify: `src/screens/DataManagementScreen.tsx`
- Modify: `src/screens/AnalyticsScreen.tsx`
- Modify: `src/screens/RecurringTransactionsScreen.tsx`
- Modify: `src/screens/FinancialGoalsScreen.tsx`
- Modify: `src/screens/CategoryManagementScreen.tsx`
- Modify: `package.json` and `package-lock.json` to add `@react-navigation/native-stack` 7.x, which is not currently installed and supplies native stack/back behavior using the existing `react-native-screens` package.

**Interfaces:**
- Produces: `RootStackParamList` routes for `MainTabs`, `Analytics`, `Settings`, `RecurringTransactions`, `FinancialGoals`, and `CategoryManagement`; `Analytics` accepts the optional `initialScope` already used by Dashboard.
- Produces: `ScreenHeader` prop `onSettingsPress?: () => void` for the consistent Settings action on primary screens.

- [ ] **Step 1: Add the native-stack navigation dependency**

Add `@react-navigation/native-stack` 7.x, aligned with the installed React Navigation 7 packages, and update the lockfile. The current package manifest has no stack navigator; the native stack uses the already installed `react-native-screens` package.

- [ ] **Step 2: Type and assemble the root stack around the existing tabs**

Keep `RootTabParamList` and the five tab routes. Add `RootStackParamList`, place the tab navigator on `MainTabs`, and register each existing secondary screen as a stack route.

- [ ] **Step 3: Preserve entry points and use route back behavior**

Navigate from Dashboard to Analytics and Recurring Transactions, Budgets to Financial Goals, and Data to Category Management. Remove the current modal/in-screen replacement state; remove Analytics’ nested `Modal` wrapper; wire existing close/back controls to `navigation.goBack()`. Android system Back is handled by the native stack.

- [ ] **Step 4: Move Appearance into Settings**

Create Settings with the existing System, Light, and Dark choices using `useTheme`. Add the Settings action to `ScreenHeader` and wire it on the five primary tabs. Remove Appearance controls from `DataManagementScreen`; keep data safety and categories in Data.

- [ ] **Step 5: Typecheck and verify navigation on Android**

Run: `npm run typecheck`

On Android, open Settings from every primary tab, choose each theme, navigate to every secondary route, and use both the in-app back action and system Back. Expected: Settings theme changes persist and Back returns to the route that opened each screen.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/navigation/AppNavigator.tsx src/navigation/types.ts src/components/ScreenHeader.tsx src/screens/SettingsScreen.tsx src/screens/DashboardScreen.tsx src/screens/AddTransactionScreen.tsx src/screens/HistoryScreen.tsx src/screens/BudgetsScreen.tsx src/screens/DataManagementScreen.tsx src/screens/AnalyticsScreen.tsx src/screens/RecurringTransactionsScreen.tsx src/screens/FinancialGoalsScreen.tsx src/screens/CategoryManagementScreen.tsx
git commit -m "Add Settings and stack navigation"
```

### Task 5: Refresh the primary screens and accessibility checks

**Files:**
- Modify: `src/theme/theme.ts` and `src/theme/layout.ts` only where shared tokens need adjustment.
- Modify: `src/components/ScreenHeader.tsx` and shared components used by primary screens.
- Modify: `src/screens/DashboardScreen.tsx`
- Modify: `src/screens/AddTransactionScreen.tsx`
- Modify: `src/screens/HistoryScreen.tsx`
- Modify: `src/screens/BudgetsScreen.tsx`
- Modify: `src/screens/DataManagementScreen.tsx`
- Modify: `src/screens/SettingsScreen.tsx`
- Modify: `tests/theme.test.ts` and `tests/accessibility.test.ts`

**Interfaces:**
- Consumes: the five-tab and Settings routes from Task 4.
- Preserves: existing form validation, search/filter behavior, budgets, data-safety actions, and persisted theme choices.

- [ ] **Step 1: Replace the tautological touch-target assertion**

Remove the local `const minTargetDp = 48` self-check from `tests/accessibility.test.ts`. Keep checks tied to actual app theme/typography values. Audit interactive controls on the five tabs and Settings, and make any undersized controls at least 48 dp without changing their actions.

- [ ] **Step 2: Improve shared hierarchy and primary-screen layouts**

Use the existing tokens and shared components to establish consistent titles, spacing, surface grouping, button hierarchy, and feedback states. Apply the screen goals from the spec: balance and month summary on Dashboard; clear amount/type/category/date emphasis on Add; search/filter/list hierarchy on History; limit/used/remaining hierarchy on Budgets; grouped safety actions on Data; theme choices and app information in Settings. Avoid nested cards where a heading or divider is clearer.

- [ ] **Step 3: Verify theme and accessibility contracts**

Run: `bun test tests/theme.test.ts tests/accessibility.test.ts` and `npm run typecheck`

Expected: actual palette and typography checks pass; no constant-only touch-target assertion remains.

- [ ] **Step 4: Review rendered screens with TalkBack and large text**

On Android, inspect each primary screen at normal and increased font size, check narrow-width layout and 48 dp targets, and verify labels, selected states, error announcements, and Settings navigation with TalkBack. Record any remaining device limitation rather than marking it passed.

- [ ] **Step 5: Commit**

```bash
git add src/theme/theme.ts src/theme/layout.ts src/components/ScreenHeader.tsx src/screens/DashboardScreen.tsx src/screens/AddTransactionScreen.tsx src/screens/HistoryScreen.tsx src/screens/BudgetsScreen.tsx src/screens/DataManagementScreen.tsx src/screens/SettingsScreen.tsx tests/theme.test.ts tests/accessibility.test.ts
git commit -m "Improve Kyros screen hierarchy and accessibility"
```

### Task 6: Improve analytics chart clarity

**Files:**
- Modify: `src/screens/AnalyticsScreen.tsx`
- Modify: `src/components/MonthlyTrendChart.tsx`
- Modify: `src/components/CategoryBreakdownChart.tsx`
- Test: `tests/chartComponents.test.ts`

**Interfaces:**
- Consumes: the approved savings-rate result and Settings/navigation structure from earlier tasks.
- Preserves: the existing six-month range, selected-month interaction, category totals, and integer-paise calculations.

- [ ] **Step 1: Add chart cases for empty, zero, and deficit data**

Extend `tests/chartComponents.test.ts` to cover zero-value series, large and small category values, and exact formatted amounts. The financial edge cases and negative net balance are owned by `tests/analytics.test.ts` in Task 1.

- [ ] **Step 2: Improve chart scale, labels, and contextual text**

Update the custom charts using React Native core components only. Make the trend scale understandable, retain month labels and income/expense legend, expose exact values through accessibility labels, and ensure category values are available in text as well as color. Keep empty states explicit.

- [ ] **Step 3: Verify chart and analytics behavior**

Run: `bun test tests/chartComponents.test.ts` and `npm run typecheck`

Expected: exact financial values and chart edge cases pass without adding a chart package.

- [ ] **Step 4: Review the rendered Analytics screen**

On Android in light and dark themes, check six-month trends, month selection, long category names, large amounts, empty history, and TalkBack chart descriptions.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AnalyticsScreen.tsx src/components/MonthlyTrendChart.tsx src/components/CategoryBreakdownChart.tsx tests/chartComponents.test.ts
git commit -m "Clarify financial analytics charts"
```

### Task 7: Compare performance and fix only measured bottlenecks

**Files:**
- Modify only the profiled hot-path source files.
- Update: `docs/superpowers/performance/2026-11-27-kyros-1-0-baseline.md` with before/after results.

**Interfaces:**
- Consumes: Task 3 baseline and the final navigation, UI, and analytics behavior.
- Produces: same-device, same-build, same-dataset measurements and any minimal fix justified by them.

- [ ] **Step 1: Re-run the Task 3 profile on the same Android device and datasets**

Repeat cold launch, Dashboard entry, Analytics open/month change, and History search/filter. Use the same measurement method and record the results beside the baseline.

- [ ] **Step 2: Compare results and locate any user-visible regression**

If a flow is slower or visibly janks, use the React Native profiler to identify the responsible work before editing. If no user-visible regression is measured, make no speculative performance code change and record that result.

- [ ] **Step 3: Add a focused regression check for each proven code fix**

For calculation changes, add/extend pure tests in `tests/analytics.test.ts`. For other fixes, add the smallest deterministic test at the owning boundary; do not add wall-clock assertions to the Bun suite.

- [ ] **Step 4: Apply the smallest fix and repeat the profile**

Compare before/after using the same device, build, and data. Expected: the measured hot path improves without changing financial results, navigation, or stored data.

- [ ] **Step 5: Commit the performance slice**

If code changed, commit the exact changed source files, owning regression test, and before/after record together with a concise plain-language message. If no code change was justified, commit only the completed profile record.

### Task 8: Align the 1.0 launch plan and verify the release candidate

**Files:**
- Modify: `docs/superpowers/specs/2026-11-27-kyros-1-0-launch-design.md`
- Modify: `docs/superpowers/plans/2026-11-27-kyros-1-0-launch.md`
- Modify: `plan.md`, `README.md`, `ANDROID_RELEASE.md`, and `release-notes/v1.0.0.md` as needed.
- Update affected GitHub wiki pages before release reaches `main`.

- [ ] **Step 1: Remove the stale “later release” scope**

Describe the shipped UI, Settings, analytics, backup metadata, and measured-performance work consistently in the 1.0 launch design, launch plan, roadmap, README, Android release guide, and release notes. Keep cloud sync and accounts explicitly out of 1.0.

- [ ] **Step 2: Run the project verification commands**

Run: `npm test` and `npm run typecheck`

Expected: all Bun tests pass and TypeScript exits 0.

- [ ] **Step 3: Build and install the Android release candidate**

Use the project’s existing release build path and signing identity. On Android, verify fresh install and upgrade from `v0.6.2` (versionCode 12) to `1.0.0` (versionCode 13), database/data continuity, backup export/restore, theme persistence, navigation Back, and primary analytics flows.

- [ ] **Step 4: Verify release documentation**

Check version `1.0.0`, versionCode derivation, schema v4, signing guidance, local-only storage, and the actual shipped feature scope. Before release reaches `main`, review affected GitHub wiki pages, update any stale guidance, and verify the published pages.

- [ ] **Step 5: Commit the release alignment**

```bash
git add docs/superpowers/specs/2026-11-27-kyros-1-0-launch-design.md docs/superpowers/plans/2026-11-27-kyros-1-0-launch.md plan.md README.md ANDROID_RELEASE.md release-notes/v1.0.0.md
git commit -m "Align the Kyros 1.0 release guidance"
```

---

## Plan Self-Review

- **Spec coverage:** UI, analytics, Settings, navigation Back behavior, accessibility, performance measurement, backup app version, local-only data, five tabs, release docs, and wiki guidance each have an owning task.
- **Review-focus coverage:** financial edge cases are in Task 1; backup compatibility is in Task 2; routes and accessibility are manually exercised in Tasks 4–6; large-data performance is profiled in Tasks 3 and 7.
- **Dependencies:** Execute Task 3 first to capture the pre-change baseline. Tasks 1 and 2 are otherwise independent. Task 4 precedes UI work in Task 5 and Analytics presentation in Task 6. Task 7 compares the final app to Task 3. Task 8 is last.
- **Known limitation:** no Android emulator or device is available on this machine now. Tasks 3, 5, 6, and 7 cannot be claimed complete until suitable device access is available; code tasks may proceed while device checks remain pending.

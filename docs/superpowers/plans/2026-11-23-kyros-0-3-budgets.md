# Kyros 0.3 Budgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task by task. Use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Kyros 0.3 with recurring monthly overall and per-expense-category budgets and current-local-month progress.

**Architecture:** Extend the existing SQLite storage and transactional schema migration, then load budgets through the existing `TransactionsContext`. Add a dedicated Budgets tab for management and progress. Reuse current month boundaries and checked integer-paise calculations; persist only budget limits and derive actuals from transactions.

**Tech Stack:** React Native 0.88, TypeScript 6, React Navigation bottom tabs, Android SQLite module, Bun tests, Gradle, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-23-kyros-0-3-budgets-design.md`

## Global Constraints

- Android remains the supported platform, minimum Android 7.0 (API 24).
- SQLite remains the source of truth. Advance the schema from v2 to v3 with a transactional migration that leaves existing transaction and category rows unchanged and rolls back fully on failure.
- Store budget amounts as positive, safe integer paise. Reject invalid amounts at the input/storage boundary; do not round financial totals.
- Only expense categories can have category budgets. Associate a category budget with its category ID so its ownership is unambiguous.
- Allow at most one overall budget and one budget per expense category. Deleting or changing a budget never changes transactions or categories.
- Calculate actuals over the current local-calendar month, using the same date-boundary rules as the dashboard. Income never contributes to spending.
- The same saved monthly limits apply each calendar month; progress resets at month boundaries. There is no rollover or notification behavior.
- Do not add dependencies. Reuse the current storage, state, navigation, formatting, and React Native patterns.
- Before a release reaches `main`, add versioned release notes and align user-facing setup/data guidance. After the release, review, update, and verify affected published GitHub wiki pages.

## Review Focus

- Fresh install and v1/v2 upgrade: all existing transaction/category IDs and values survive and schema reaches v3; pin in `tests/schema.test.ts`.
- Migration fails before commit: v2 schema and data remain intact; pin with `test_v2_to_v3_migration_rolls_back_on_failure` in `tests/schema.test.ts`.
- Invalid amount, duplicate scope, missing category, or income category: reject without changing saved data; pin in `tests/budgetStorage.test.ts`.
- Transaction occurs on the first or last day of the current local month: include it in progress; pin in `tests/budgetProgress.test.ts` and `tests/dates.test.ts`.
- Income, zero expenses, overspending, or unsafe total: exclude income, return exact zero/negative remaining values, and reject unsafe sums; pin in `tests/budgetProgress.test.ts`.

---

### Task 1: Persist budgets safely — issue #28

**Files:**
- Modify: `src/storage/schema.ts`
- Modify: `src/storage/types.ts`
- Modify: `src/storage/index.ts`
- Modify: `src/lib/database.ts`
- Create: `src/storage/budgetStorage.ts`
- Modify: `tests/schema.test.ts`
- Create: `tests/budgetStorage.test.ts`
- Reuse: `tests/helpers/bunSqliteAdapter.ts`

**Interfaces:**
- Produce `Budget { id: number; categoryId: number | null; amountMinor: MinorUnits }` in `src/storage/types.ts`; `categoryId: null` means the overall budget.
- Produce `NewBudgetInput { categoryId?: unknown; amountMinor: unknown }`.
- Produce `BudgetStorage` with `initialize(): Promise<void>`, `listBudgets(): Promise<Budget[]>`, `saveBudget(input: NewBudgetInput): Promise<Budget>`, and `deleteBudget(id: number): Promise<void>`.
- Produce `createBudgetStorage(db: SQLiteDatabaseLike): BudgetStorage` and `getBudgetStorage(): Promise<BudgetStorage>`.

- [ ] **Step 1: Add migration tests**

Add `test_v2_to_v3_migration_preserves_transactions_and_categories`, using a v2 fixture with representative income/expense entries and categories; assert every original row retains its ID and values, `budgets` exists, and `PRAGMA user_version` is 3. Add `test_v2_to_v3_migration_rolls_back_on_failure` using `failBeforeCommit`; assert the v2 schema/data/version remain intact. Update the existing v1 migration assertion so the supported migration chain ends at schema 3.

- [ ] **Step 2: Run the schema tests and confirm the new migration assertions fail**

Run: `npm test -- tests/schema.test.ts`
Expected: the new v2-to-v3 assertions fail because budgets and schema v3 are not implemented.

- [ ] **Step 3: Implement the v3 budget schema and migration**

Create a budgets table with integer-paise validation, a nullable category foreign key, a scope check, and SQLite uniqueness that permits one overall budget and one budget per category. Apply v1-to-v2 and v2-to-v3 migrations in order within the existing transaction. Fresh installs must create the latest schema directly.

- [ ] **Step 4: Add storage validation and persistence tests**

Add `test_budget_storage_saves_and_updates_overall_and_category_scopes`, `test_budget_storage_rejects_duplicate_invalid_and_income_category_budgets`, and `test_budget_storage_delete_leaves_transactions_and_categories_unchanged`. Assert positive safe-integer paise, category existence/type checks, stable listing, and deletion behavior.

- [ ] **Step 5: Implement budget storage and exports**

Implement `createBudgetStorage` using parameterized SQL. Validate amount and category ownership before saving; upsert by overall/category scope without mutating transactions. Export the budget types and factory from `src/storage/index.ts`. Add `getBudgetStorage()` through the existing single-database accessor, awaiting transaction storage initialization before use.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- tests/schema.test.ts tests/budgetStorage.test.ts`
Expected: all migration and budget-storage tests pass.

Commit: `Add transactional monthly budget storage`

After review, push the completed issue slice as a PR into `dev`, merge it with a merge commit so `feat/v0.3` can continue incrementally, then explicitly close issue #28 (merging into `dev` does not auto-close issues for this repository).

### Task 2: Manage budgets — issue #29

**Files:**
- Modify: `src/state/TransactionsContext.tsx`
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/AppNavigator.tsx`
- Create: `src/screens/BudgetsScreen.tsx`
- Create: `src/components/BudgetForm.tsx`
- Modify: `tests/budgetStorage.test.ts` only if a boundary regression is found

**Interfaces:**
- Extend `TransactionsContextValue` with `budgets: Budget[]`, `saveBudget(input: NewBudgetInput): Promise<Budget>`, and `deleteBudget(id: number): Promise<void>`.
- Add `Budgets: undefined` to `RootTabParamList`.
- Keep budget scope encoded by `categoryId: null` for the overall limit and a valid expense `categoryId` for a category limit.

- [ ] **Step 1: Extend context loading and mutations**

Load budgets alongside transactions/categories through `getBudgetStorage()`. Implement save/delete methods that persist, then use the existing silent refresh/error behavior so the screen always reflects storage.

- [ ] **Step 2: Add the Budgets navigation route and screen**

Register a `Budgets` tab in `AppNavigator` with an icon entry and add a screen using the existing `ScreenHeader`, `StateViews`, theme, and context patterns. Show saved overall and category limits with setup actions for missing scopes.

- [ ] **Step 3: Add accessible add/edit/delete forms**

Use the existing INR input/formatting and expense category choices. Support creating, updating, and removing a scope; preserve form values on failure, prevent double submit, and show a clear validation/error state.

- [ ] **Step 4: Verify and commit the management slice**

Run: `npm run typecheck` and `npm test -- tests/budgetStorage.test.ts`
Expected: context/navigation types pass and the persistence boundary tests remain green. Manually verify saving each budget type, editing, removal, app refresh, and accessible labels in the Android app.

Commit: `Add budget management screen`

After review, raise and merge the issue #29 PR into `dev`, then explicitly close #29.

### Task 3: Show current-month progress — issue #30

**Files:**
- Modify: `src/lib/dates.ts`
- Modify: `src/screens/DashboardScreen.tsx`
- Modify: `src/screens/BudgetsScreen.tsx`
- Create: `src/lib/budgetProgress.ts`
- Create: `tests/dates.test.ts`
- Create: `tests/budgetProgress.test.ts`

**Interfaces:**
- Export `currentMonthBounds(now: Date): { dateFrom: string; dateTo: string }` from `src/lib/dates.ts`, moving the existing dashboard implementation so both screens share the same local-calendar boundary logic.
- Produce `BudgetProgress { id: number; categoryId: number | null; budgetMinor: number; spentMinor: number; remainingMinor: number }` in `src/lib/budgetProgress.ts`.
- Produce `calculateBudgetProgress(budgets: readonly Budget[], transactions: readonly Transaction[], dateFrom: string, dateTo: string): BudgetProgress[]` in `src/lib/budgetProgress.ts`.

- [ ] **Step 1: Add date-boundary and progress tests**

Add `test_current_month_bounds_use_local_calendar_dates` for a year/month boundary. Add `test_budget_progress_matches_expense_history_and_excludes_income` for overall/category actuals and inclusive bounds, plus `test_budget_progress_handles_zero_spend_overspending_and_unsafe_totals`.

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `npm test -- tests/dates.test.ts tests/budgetProgress.test.ts`
Expected: progress helper is missing and the date helper remains private to the dashboard.

- [ ] **Step 3: Extract and test shared current-month bounds**

Move the dashboard's current local-month boundary calculation into `src/lib/dates.ts`; update `DashboardScreen` to call the shared helper. Do not change the dashboard's existing summary semantics.

- [ ] **Step 4: Implement checked budget progress calculations**

Sum only expense transactions inside the inclusive bounds, aggregate by category ID, use checked safe-integer addition, and return spent/remaining for every saved budget including zero-spend budgets. Do not persist actual totals.

- [ ] **Step 5: Render progress and verify after transaction changes**

Show spent, remaining, and numeric overspend for the overall budget and each category budget. A visual indicator may cap at 100%, while the displayed amounts remain exact. Keep the no-budget state actionable and refresh progress after add/edit/delete via context data.

- [ ] **Step 6: Run focused and full checks, then commit**

Run: `npm test -- tests/dates.test.ts tests/budgetProgress.test.ts tests/summaries.test.ts`, then `npm test` and `npm run typecheck`.
Expected: focused and full tests pass and TypeScript reports no errors.

Commit: `Show spending against monthly budgets`

After review, raise and merge the issue #30 PR into `dev`, then explicitly close #30.

### Task 4: Prepare v0.3.0 release artifacts — issue #31

**Files:**
- Modify: `package.json`
- Modify: `android/app/build.gradle`
- Modify: `README.md`
- Modify: `ANDROID_RELEASE.md`
- Create: `release-notes/v0.3.0.md`

- [ ] **Step 1: Update version and user-facing product guidance**

Set `package.json` and Gradle `versionName` to `0.3.0`; set the Gradle source `versionCode` to 5 so the current release workflow produces v0.3.0/code 6 after v0.2.0/code 5. Document overall and category budgets, monthly recurrence, current-month progress, schema v2-to-v3 upgrade behavior, and the release workflow. Add concise v0.3.0 release notes.

- [ ] **Step 2: Run release readiness checks**

Run: `npm test`, `npm run typecheck`, and `npm run android` on an Android device/emulator.
Expected: all checks pass and the debug app installs/launches. Verify fresh setup, both budget types, progress against history, over-budget values, transaction edits/deletions, and offline use.

- [ ] **Step 3: Commit and merge the release-preparation PR**

Commit: `Prepare Kyros 0.3.0 release guidance`

Raise and merge issue #31's PR into `dev`, then explicitly close #31. The `dev` push runs the repository's CI checks and debug APK build. Release to `main` only after the signed release workflow and upgrade verification are ready.

### Task 5: Verify the published release and wiki — issue #32

**Files:**
- GitHub Release artifact and published wiki pages; no repository code files unless verification finds a defect.

- [ ] **Step 1: Verify the signed v0.3.0 APK and upgrade path after release to `main`**

Install the previous signed APK with representative income/expense transactions, then install the signed v0.3.0 APK with the same key. Confirm all prior transaction/category IDs and values remain after schema v2-to-v3 migration. Set both budgets and compare progress to History; verify income exclusion and offline use.

- [ ] **Step 2: Update and verify affected published wiki pages**

Review existing usage, local-data/migration, setup, and release pages against the published v0.3.0 behavior. Update affected pages and reopen them from GitHub to verify the published guidance.

- [ ] **Step 3: Record evidence and close issue #32**

Record the release tag/APK and pass results in issue #32, then close it. This post-release wiki/artifact task has no code PR to `dev`.

---

## Self-review

- Spec coverage: storage/migration, budget management, current-month progress, release artifacts, and post-release wiki verification each have an owning task and matching issue.
- Safety coverage: migration rollback, preservation of transaction/category rows, category type validation, duplicate scope prevention, invalid amounts, and safe integer totals are pinned by tests.
- Integration coverage: context refresh after budget and transaction mutations, shared local-month boundaries, and history reconciliation are explicit.
- Scope stays within the confirmed choices: both budget types, recurring monthly limits, current-month-only progress, a dedicated Budgets tab, and no alerts or rollover.
- No dependency or backend is added. The release workflow version calculation was checked against `.github/workflows/ci.yml`: source versionCode 5 yields v0.3.0 code 6 after the latest published code 5.

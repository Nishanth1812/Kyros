# Kyros 0.6 Feature Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task by task. Use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Kyros 0.6 spanning:
1. Category Management (rename, archive, and atomic reassign-on-delete)
2. Recurring Transaction Scheduler & Dashboard 1-tap review
3. Financial Goals Tracker with contribution progress & budget warning indicators
4. Dynamic Theme System (Dark / Light / System) & Enhanced History Search/Tags
5. Cloud Sync Delta Engine, Tombstone Tracker, & Backup V2
6. Release Preparation, Documentation, and Build Verification

**Architecture:** Offline-first SQLite schema v4 with `updated_at`, `is_archived`, and `deleted_tombstones`. New domain modules for recurring schedules, financial goals, and sync deltas. React Native dynamic theme provider and accessible components with >= 48dp touch targets. Integer paise precision across all financial amounts.

**Tech Stack:** React Native 0.88, TypeScript 6, React Navigation bottom tabs & modals, Android SQLite & SAF modules, Bun tests, Gradle, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-24-kyros-0-6-expansion-design.md`

---

## Global Invariants & Constraints

- Android minimum version remains Android 7.0 (API 24).
- All financial calculations use integer minor units (paise). Zero floating-point arithmetic reaches storage.
- Deleting a category with transactions must never orphan rows: atomic reassignment to an active, same-type category is mandatory.
- Re-running migrations or running initialization on existing databases must be idempotent and non-destructive.
- Every interactive element maintains a minimum touch target size of 48×48 dp.
- Offline-first SQLite is the single source of truth; no network connectivity required.

---

### Task 1: Schema Migration v4, Category Management, & Reassignment Engine

**Files:**
- Modify: `src/storage/schema.ts`
- Modify: `src/storage/categoryStorage.ts`
- Modify: `src/state/categoriesContext.tsx`
- Create: `src/screens/CategoryManagementScreen.tsx`
- Create: `tests/categoryManagement.test.ts`
- Modify: `tests/schema.test.ts`

**Interfaces & Signatures:**
```typescript
interface Category {
  id: number;
  name: string;
  type: 'income' | 'expense';
  isBuiltIn: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: number;
}

function renameCategory(db: SqliteDb, categoryId: number, newName: string): Promise<Category>;
function archiveCategory(db: SqliteDb, categoryId: number, isArchived: boolean): Promise<Category>;
function deleteCategoryWithReassignment(
  db: SqliteDb,
  categoryIdToDelete: number,
  targetCategoryId: number
): Promise<{ reassignedCount: number }>;
```

**Unit Test Requirements (`tests/categoryManagement.test.ts`):**
- `test_schema_v3_to_v4_migration_preserves_all_data_and_sets_timestamps`
- `test_v4_migration_rolls_back_atomically_on_failure`
- `test_rename_category_updates_name_and_timestamp_and_enforces_uniqueness`
- `test_rename_category_rejects_built_in_categories_and_blank_names`
- `test_archive_category_toggles_flag_and_excludes_from_active_list`
- `test_delete_category_reassigns_transactions_atomically_and_logs_tombstone`
- `test_delete_category_rejects_mismatched_type_or_archived_target`
- `test_delete_category_without_transactions_removes_category_and_logs_tombstone`

- [x] **Step 1: Write schema v4 and category management unit tests**
  Implement comprehensive tests in `tests/categoryManagement.test.ts` matching all test cases above.
- [x] **Step 2: Update schema definitions and v4 migration**
  Update `src/storage/schema.ts` with v4 DDL, column additions, indexes, and transactional migration logic from v3 to v4.
- [x] **Step 3: Implement category management operations**
  Implement `renameCategory`, `archiveCategory`, and `deleteCategoryWithReassignment` in `src/storage/categoryStorage.ts`.
- [x] **Step 4: Update categories context**
  Update `src/state/categoriesContext.tsx` exposing `renameCategory`, `archiveCategory`, and `deleteCategoryWithReassignment`.
- [x] **Step 5: Build CategoryManagementScreen**
  Create `src/screens/CategoryManagementScreen.tsx` with category list, archive toggle, rename modal, and reassignment-guarded delete dialog (all >= 48dp touch targets).
- [x] **Step 6: Run tests and typecheck**
  Run: `bun test tests/categoryManagement.test.ts tests/schema.test.ts` and `npm run typecheck`.

---

### Task 2: Recurring Transaction Scheduler & Dashboard 1-Tap Review

**Files:**
- Create: `src/storage/recurringStorage.ts`
- Create: `src/lib/recurringEngine.ts`
- Create: `src/screens/RecurringTransactionsScreen.tsx`
- Create: `src/components/RecurringReviewBanner.tsx`
- Create: `tests/recurringTransactions.test.ts`
- Modify: `src/screens/DashboardScreen.tsx`

**Interfaces & Signatures:**
```typescript
type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

interface RecurringTransaction {
  id: number;
  amountMinor: number;
  type: 'income' | 'expense';
  categoryId: number;
  description: string | null;
  frequency: RecurringFrequency;
  nextDueDate: string; // YYYY-MM-DD
  isActive: boolean;
  createdAt: string;
  updatedAt: number;
}

function calculateNextDueDate(currentDueDate: string, frequency: RecurringFrequency): string;
function findDueRecurringTransactions(
  schedules: RecurringTransaction[],
  asOfDate: string
): RecurringTransaction[];
function applyRecurringTransaction(
  db: SqliteDb,
  scheduleId: number,
  applyDate?: string
): Promise<{ transaction: Transaction; nextDueDate: string }>;
```

**Unit Test Requirements (`tests/recurringTransactions.test.ts`):**
- `test_calculate_next_due_date_daily_and_weekly`
- `test_calculate_next_due_date_monthly_pins_to_month_end_correctly` (Jan 31 -> Feb 28, Feb 28 -> Mar 31)
- `test_calculate_next_due_date_yearly_handles_leap_years`
- `test_find_due_recurring_transactions_filters_by_date_and_active_status`
- `test_apply_recurring_transaction_inserts_transaction_and_advances_due_date`
- `test_recurring_storage_crud_persists_and_updates_timestamps`

- [x] **Step 1: Write recurring transactions unit tests**
  Implement `tests/recurringTransactions.test.ts` covering date arithmetic, leap year logic, and storage operations.
- [x] **Step 2: Implement recurringStorage and recurringEngine**
  Implement `src/storage/recurringStorage.ts` and `src/lib/recurringEngine.ts`.
- [x] **Step 3: Build RecurringTransactionsScreen**
  Create `src/screens/RecurringTransactionsScreen.tsx` with frequency selectors, amount inputs in rupees/paise, and category pickers.
- [x] **Step 4: Build RecurringReviewBanner and integrate into Dashboard**
  Implement `src/components/RecurringReviewBanner.tsx` with "Apply All" and "Review" actions; embed at top of `DashboardScreen.tsx`.
- [x] **Step 5: Run tests and typecheck**
  Run: `bun test tests/recurringTransactions.test.ts` and `npm run typecheck`.

---

### Task 3: Financial Goals Tracker & Budget Warning Alerts

**Files:**
- Create: `src/storage/goalStorage.ts`
- Create: `src/lib/goalCalculations.ts`
- Create: `src/screens/FinancialGoalsScreen.tsx`
- Create: `src/components/GoalCard.tsx`
- Create: `tests/goals.test.ts`
- Modify: `src/screens/BudgetsScreen.tsx`

**Interfaces & Signatures:**
```typescript
interface FinancialGoal {
  id: number;
  title: string;
  targetAmountMinor: number;
  currentSavedMinor: number;
  targetDate: string | null; // YYYY-MM-DD
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: number;
}

function calculateGoalProgress(goal: FinancialGoal, asOfDate?: string): {
  percentage: number;
  remainingMinor: number;
  isCompleted: boolean;
  projectedMonthlySavingsMinor?: number;
};
```

**Unit Test Requirements (`tests/goals.test.ts`):**
- `test_calculate_goal_progress_percentages_and_caps`
- `test_calculate_goal_progress_projected_monthly_savings`
- `test_goal_storage_crud_and_status_transitions`
- `test_goal_deposit_and_withdraw_updates_current_saved_and_marks_completed`
- `test_budget_progress_warning_threshold_triggers_at_80_percent`
- `test_budget_progress_danger_threshold_triggers_at_100_percent`

- [x] **Step 1: Write goals and budget warning tests**
  Implement `tests/goals.test.ts` covering progress calculation, contributions, status transitions, and threshold logic.
- [x] **Step 2: Implement goalStorage and goalCalculations**
  Implement `src/storage/goalStorage.ts` and `src/lib/goalCalculations.ts`.
- [x] **Step 3: Build GoalCard and FinancialGoalsScreen**
  Create accessible `src/components/GoalCard.tsx` and `src/screens/FinancialGoalsScreen.tsx` with target dates, contribution modals, and completion badges.
- [x] **Step 4: Update BudgetsScreen with 80% warning indicators**
  Enhance `src/screens/BudgetsScreen.tsx` with amber warning badge (`#F59E0B`) at 80% and red alert at 100%.
- [x] **Step 5: Run tests and typecheck**
  Run: `bun test tests/goals.test.ts` and `npm run typecheck`.

---

### Task 4: Dynamic Theme Engine (Dark/Light/System) & History Search/Tags

**Files:**
- Modify: `src/theme/theme.ts`
- Create: `src/theme/ThemeContext.tsx`
- Create: `src/lib/transactionSearch.ts`
- Modify: `src/screens/HistoryScreen.tsx`
- Create: `tests/theme.test.ts`
- Create: `tests/transactionSearch.test.ts`

**Interfaces & Signatures:**
```typescript
type ThemeMode = 'system' | 'light' | 'dark';

interface ThemePalette {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  expense: string;
  income: string;
  warning: string;
}

function parseTags(description: string | null): string[];
function filterTransactionsByQueryAndTags(
  transactions: Transaction[],
  categories: Category[],
  query: string,
  selectedTag?: string
): Transaction[];
```

**Unit Test Requirements (`tests/theme.test.ts`, `tests/transactionSearch.test.ts`):**
- `test_theme_palettes_provide_wcag_aaa_contrast_for_text`
- `test_parse_tags_extracts_hashtags_and_ignores_empty_or_special_chars`
- `test_filter_by_query_matches_description_category_and_formatted_rupees`
- `test_filter_by_query_and_tag_combines_filters_accurately`

- [x] **Step 1: Write theme and search unit tests**
  Implement `tests/theme.test.ts` and `tests/transactionSearch.test.ts`.
- [x] **Step 2: Implement ThemeContext and dark palette**
  Expand `src/theme/theme.ts` with dark theme tokens and implement `src/theme/ThemeContext.tsx` with `Appearance` listener.
- [x] **Step 3: Implement transactionSearch module**
  Build `src/lib/transactionSearch.ts` with hashtag parser and case-insensitive query matcher.
- [x] **Step 4: Integrate Search and Tags into HistoryScreen**
  Update `src/screens/HistoryScreen.tsx` with search input, horizontal hashtag chips, and empty result feedback.
- [x] **Step 5: Run tests and typecheck**
  Run: `bun test tests/theme.test.ts tests/transactionSearch.test.ts` and `npm run typecheck`.

---

### Task 5: Cloud Sync Delta Engine, Tombstone Tracker, & Backup V2

**Files:**
- Create: `src/storage/syncEngine.ts`
- Create: `src/storage/syncStorage.ts`
- Modify: `src/storage/backupValidation.ts`
- Modify: `src/storage/backupStorage.ts`
- Modify: `src/screens/DataManagementScreen.tsx`
- Create: `tests/syncEngine.test.ts`
- Modify: `tests/backupStorage.test.ts`
- Modify: `tests/backupValidation.test.ts`

**Interfaces & Signatures:**
```typescript
interface KyrosSyncDeltaV1 {
  version: 1;
  clientTimestamp: number;
  sinceTimestamp: number;
  changes: {
    transactions: Transaction[];
    categories: Category[];
    budgets: BudgetRecord[];
    goals: FinancialGoal[];
    recurring: RecurringTransaction[];
  };
  tombstones: TombstoneRecord[];
}

function generateSyncDelta(db: SqliteDb, sinceTimestamp: number): Promise<KyrosSyncDeltaV1>;
function applySyncDelta(db: SqliteDb, delta: KyrosSyncDeltaV1): Promise<SyncReconciliationResult>;
```

**Unit Test Requirements (`tests/syncEngine.test.ts`):**
- `test_generate_sync_delta_extracts_entities_updated_after_timestamp`
- `test_generate_sync_delta_extracts_tombstones_for_deleted_items`
- `test_apply_sync_delta_inserts_new_records_and_updates_newer_records`
- `test_apply_sync_delta_preserves_local_edits_when_local_is_newer` (LWW)
- `test_apply_sync_delta_deletes_records_specified_in_tombstones`
- `test_backup_v2_exports_all_tables_and_restores_atomically`
- `test_backup_v2_restores_legacy_v1_backup_file_with_defaults`

- [x] **Step 1: Write sync engine and backup v2 tests**
  Implement `tests/syncEngine.test.ts` and update `tests/backupValidation.test.ts` & `tests/backupStorage.test.ts`.
- [x] **Step 2: Implement syncStorage and syncEngine**
  Implement `src/storage/syncStorage.ts` and `src/storage/syncEngine.ts`.
- [x] **Step 3: Update backup validation and storage for Backup V2**
  Update `src/storage/backupValidation.ts` and `src/storage/backupStorage.ts` supporting `KyrosBackupV2` while accepting `KyrosBackupV1`.
- [x] **Step 4: Update DataManagementScreen**
  Show sync engine readiness, tombstone counts, and Backup V2 export options.
- [x] **Step 5: Run tests and typecheck**
  Run: `bun test tests/syncEngine.test.ts tests/backupStorage.test.ts` and `npm run typecheck`.

---

### Task 6: Release Preparation, Documentation, and Build Verification

**Files:**
- Modify: `package.json` (bump to 0.6.0)
- Modify: `android/app/build.gradle` (bump versionCode to 9, versionName to "0.6.0")
- Create: `release-notes/v0.6.0.md`
- Modify: `README.md`
- Modify: `plan.md`

- [x] **Step 1: Update version numbers**
  Update version in `package.json` (`0.6.0`) and `android/app/build.gradle` (`versionCode 9`, `versionName "0.6.0"`).
- [x] **Step 2: Write release notes**
  Create `release-notes/v0.6.0.md` detailing category management, recurring engine, goals, dynamic themes, search/tags, and sync engine.
- [x] **Step 3: Update README and product roadmap**
  Update `README.md` and `plan.md` documenting 0.6.0 features.
- [x] **Step 4: Run full test suite and typecheck**
  Run: `bun test` (all tests passing) and `npm run typecheck` (zero TypeScript errors).
- [ ] **Step 5: Review/update the GitHub wiki with the release to main**
  Keep the published wiki aligned with released behavior; the current branch targets
  `dev`, so publish and verify wiki guidance when this version is released to `main`.
  Update GitHub wiki pages to reflect 0.6.0 behavior, setup, and guidance.

# Kyros 0.6 Feature Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task by task. Use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Kyros 0.6 spanning:
1. Category Management (rename, archive, and atomic reassign-on-delete)
2. Recurring Transaction Scheduler & Dashboard 1-tap review
3. Financial Goals Tracker with contribution progress & budget warning indicators
4. Dynamic Theme System (Dark / Light / System) & Enhanced History Search/Tags
5. Cloud Sync Delta Engine & Tombstone Tracker (Offline-First Foundation)
6. Release Preparation, Documentation, and Build Verification

**Architecture:** Offline-first SQLite schema v4 with `updated_at`, `is_archived`, and `deleted_tombstones`. New domain modules for recurring schedules, financial goals, and sync deltas. React Native dynamic theme provider and accessible components with >= 48dp touch targets. Integer paise precision across all financial amounts.

**Tech Stack:** React Native 0.88, TypeScript, React Navigation, Android SQLite & SAF, Bun tests.

**Spec:** `docs/superpowers/specs/2026-11-24-kyros-0-6-expansion-design.md`

---

## Global Constraints

- Android remains the supported platform, minimum Android 7.0 (API 24).
- All financial calculations use integer minor units (paise).
- Deleting a category must never leave orphaned transactions; atomic reassignment is mandatory.
- Zero external charting or state bloat; pure React Native core styling and flexbox.
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

**Scope & Interfaces:**
- Add `is_archived INTEGER NOT NULL DEFAULT 0` to `categories` table.
- Add `updated_at INTEGER NOT NULL DEFAULT 0` to `transactions`, `categories`, and `budgets`.
- Add `deleted_tombstones` table: `(id INTEGER PRIMARY KEY, entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, deleted_at INTEGER NOT NULL)`.
- `renameCategory(db, categoryId, newName)`
- `archiveCategory(db, categoryId, isArchived)`
- `deleteCategoryWithReassignment(db, categoryIdToDelete, targetCategoryId)`
- Unit tests verifying: migration v3-to-v4 preserves data; rename rejects duplicates; delete atomically moves all transactions to target category; archive hides from active listing.

- [ ] **Step 1: Write schema and category management tests**
  Create `tests/categoryManagement.test.ts` covering v4 migration, renaming, archiving, and atomic reassign-delete.
- [ ] **Step 2: Update schema definitions and v4 migration**
  Implement v4 migration in `src/storage/schema.ts`.
- [ ] **Step 3: Implement category management operations**
  Add rename, archive, and delete-with-reassign functions in `src/storage/categoryStorage.ts`.
- [ ] **Step 4: Expose actions in categories context**
  Update `src/state/categoriesContext.tsx`.
- [ ] **Step 5: Build CategoryManagementScreen**
  Implement accessible category management UI with rename, archive, and delete modals.
- [ ] **Step 6: Run tests and typecheck**
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

**Scope & Interfaces:**
- `RecurringTransaction { id: number; amountMinor: number; type: 'income' | 'expense'; categoryId: number; description: string | null; frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'; nextDueDate: string; isActive: boolean; createdAt: string; updatedAt: number }`
- `calculateNextDueDate(currentDueDate: string, frequency: RecurringFrequency): string`
- `findDueRecurringTransactions(recurring: RecurringTransaction[], asOfDate: string): RecurringTransaction[]`
- `applyRecurringTransaction(db, recurringId, date): Promise<Transaction>`
- Unit tests for recurring due date calculators, frequency advancing, leap year handling, and storage mutations.

- [ ] **Step 1: Write recurring transactions tests**
  Create `tests/recurringTransactions.test.ts` testing due date calculation, scheduling, and transaction generation.
- [ ] **Step 2: Implement recurringStorage and recurringEngine**
  Implement `src/storage/recurringStorage.ts` and `src/lib/recurringEngine.ts`.
- [ ] **Step 3: Build RecurringTransactionsScreen**
  Screen to create, edit, pause, and delete recurring schedules with min 48dp touch targets.
- [ ] **Step 4: Add RecurringReviewBanner to Dashboard**
  Banner indicating pending due transactions with "Apply All" and "Review" buttons.
- [ ] **Step 5: Run tests and typecheck**
  Run: `bun test tests/recurringTransactions.test.ts` and `npm run typecheck`.

---

### Task 3: Financial Goals Tracker & Budget Warning Indicators

**Files:**
- Create: `src/storage/goalStorage.ts`
- Create: `src/lib/goalCalculations.ts`
- Create: `src/screens/FinancialGoalsScreen.tsx`
- Create: `src/components/GoalCard.tsx`
- Create: `tests/goals.test.ts`
- Modify: `src/screens/BudgetsScreen.tsx`

**Scope & Interfaces:**
- `FinancialGoal { id: number; title: string; targetAmountMinor: number; currentSavedMinor: number; targetDate: string | null; status: 'active' | 'completed' | 'cancelled'; createdAt: string; updatedAt: number }`
- `calculateGoalProgress(goal: FinancialGoal): { percentage: number; remainingMinor: number; isCompleted: boolean; projectedSavingsPerMonthMinor?: number }`
- Budget indicators: Display amber warning badge when spending >= 80% and red alert when >= 100%.
- Unit tests for goal creation, progress calculation, target deadline projection, and budget threshold logic.

- [ ] **Step 1: Write goals and budget indicator tests**
  Create `tests/goals.test.ts` testing goal calculations, contributions, completion status, and budget warnings.
- [ ] **Step 2: Implement goalStorage and goalCalculations**
  Implement `src/storage/goalStorage.ts` and `src/lib/goalCalculations.ts`.
- [ ] **Step 3: Build GoalCard and FinancialGoalsScreen**
  Accessible card with progress bar, remaining rupees, and deadline indicator.
- [ ] **Step 4: Update BudgetsScreen with 80% warning indicators**
  Add visual amber threshold alert to `BudgetsScreen.tsx`.
- [ ] **Step 5: Run tests and typecheck**
  Run: `bun test tests/goals.test.ts` and `npm run typecheck`.

---

### Task 4: Dynamic Theme Engine (Dark/Light/System) & Enhanced Search/Tags

**Files:**
- Modify: `src/theme/theme.ts`
- Create: `src/theme/ThemeContext.tsx`
- Create: `src/lib/transactionSearch.ts`
- Modify: `src/screens/HistoryScreen.tsx`
- Create: `tests/theme.test.ts`
- Create: `tests/transactionSearch.test.ts`

**Scope & Interfaces:**
- Themes: `'system' | 'light' | 'dark'` with complete high-contrast semantic palettes.
- `useTheme()` hook providing theme values, dark mode boolean, and `setThemeMode()`.
- Search & Tag parser: `parseTags(description: string): string[]` and `filterByQueryAndTags(transactions, query, selectedTags)`.
- Unit tests for color contrast, tag extraction, search filtering across description, amount, and category.

- [ ] **Step 1: Write theme and search tests**
  Create `tests/theme.test.ts` and `tests/transactionSearch.test.ts`.
- [ ] **Step 2: Implement dynamic ThemeContext and dark palette**
  Expand `src/theme/theme.ts` with dark theme tokens and build `src/theme/ThemeContext.tsx`.
- [ ] **Step 3: Implement transactionSearch utility**
  Build search filter and `#tag` extraction in `src/lib/transactionSearch.ts`.
- [ ] **Step 4: Integrate Search and Tags into HistoryScreen**
  Add search input and horizontal tag chips to `HistoryScreen.tsx`.
- [ ] **Step 5: Run tests and typecheck**
  Run: `bun test tests/theme.test.ts tests/transactionSearch.test.ts` and `npm run typecheck`.

---

### Task 5: Cloud Sync Delta Engine & Tombstone Tracker (Offline-First Foundation)

**Files:**
- Create: `src/storage/syncEngine.ts`
- Create: `src/storage/syncStorage.ts`
- Create: `tests/syncEngine.test.ts`
- Modify: `src/screens/DataManagementScreen.tsx`

**Scope & Interfaces:**
- `SyncDeltaPayload { clientTimestamp: number; lastSyncTimestamp: number; changes: { transactions: Transaction[]; categories: Category[]; budgets: BudgetRecord[]; goals: FinancialGoal[]; recurring: RecurringTransaction[] }; tombstones: TombstoneRecord[] }`
- `generateSyncDelta(db, lastSyncTimestamp): Promise<SyncDeltaPayload>`
- `applySyncDelta(db, payload): Promise<SyncReconciliationResult>`
- Unit tests verifying: delta generation selects only modified/created entities; deletions properly generate tombstones; LWW conflict resolution respects newest `updated_at`.

- [ ] **Step 1: Write sync engine tests**
  Create `tests/syncEngine.test.ts` testing delta extraction, tombstone creation on delete, and payload reconciliation.
- [ ] **Step 2: Implement syncStorage and syncEngine**
  Implement `src/storage/syncStorage.ts` and `src/lib/syncEngine.ts`.
- [ ] **Step 3: Integrate Sync Status in DataManagementScreen**
  Display sync engine readiness and tombstone statistics on the Data tab.
- [ ] **Step 4: Run tests and typecheck**
  Run: `bun test tests/syncEngine.test.ts` and `npm run typecheck`.

---

### Task 6: Release Preparation, Documentation, and Build Verification

**Files:**
- Modify: `package.json` (bump to 0.6.0)
- Modify: `android/app/build.gradle` (bump versionCode to 9, versionName to "0.6.0")
- Create: `release-notes/v0.6.0.md`
- Modify: `README.md`
- Modify: `plan.md`

- [ ] **Step 1: Update version numbers**
  Update version in `package.json` and `android/app/build.gradle`.
- [ ] **Step 2: Write release notes**
  Create `release-notes/v0.6.0.md` detailing category management, recurring schedules, financial goals, themes, search, and sync engine.
- [ ] **Step 3: Update README and product roadmap**
  Update `README.md` and `plan.md` to document 0.6.0 features.
- [ ] **Step 4: Verify full test suite and typecheck**
  Run: `bun test` and `npm run typecheck`.
- [ ] **Step 5: Review and update GitHub wiki**
  Update GitHub wiki pages to reflect 0.6.0 behavior, setup, and guidance.

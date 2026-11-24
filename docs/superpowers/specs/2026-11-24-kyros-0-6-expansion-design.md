# Kyros 0.6 Feature Expansion Design Specification

## Intent

Kyros 0.6 expands the application's capabilities across four core pillars:
1. **Category Management & Recurring Engine**: Full lifecycle management of custom categories (safe rename, archival, and atomic reassign-on-delete) and recurring transaction schedules with intelligent due-date tracking and 1-tap review application.
2. **Advanced Budgeting & Financial Goals**: Targeted savings goals with deadline tracking, contribution progress, and projected completion, accompanied by 80% warning and 100% danger indicators on monthly budgets.
3. **Connected Features & Cloud Sync Architecture**: Synchronizable data structures with entity revision tracking (`updated_at`), tombstones for deletions, delta payload generation, and offline-first conflict reconciliation.
4. **Appearance & UI Customization**: Dynamic system/dark/light theme switching with WCAG AAA compliant palettes, accompanied by real-time history description search and hashtag (`#tag`) filtering.

All capabilities maintain Kyros's strict foundational invariants: **100% offline-first local SQLite operation, integer minor unit (paise) precision, atomic database migrations with rollback safety, zero third-party UI/chart bloat, and >= 48dp accessibility touch targets**.

---

## Architecture Overview

```
+---------------------------------------------------------------------------------------------------+
|                                      Kyros 0.6 Application Layer                                  |
+---------------------------------------------------------------------------------------------------+
|  UI & Screens:                                                                                    |
|  - DashboardScreen (Month Navigation, Quick Distribution, Recurring Review Banner)                |
|  - AnalyticsScreen (6-Month Trends, Category Proportional Bars, Daily Metrics)                    |
|  - CategoryManagementScreen (Rename Modal, Archive Toggle, Safe Reassignment Delete Modal)        |
|  - RecurringTransactionsScreen (Schedule Form, Frequency Picker, Active Toggle)                   |
|  - FinancialGoalsScreen (Goal Progress Cards, Contribution Modal, Deadline Calculator)            |
|  - HistoryScreen (Real-time Search Bar, Horizontal #Tag Chips, Filter Dialogs)                    |
|  - DataManagementScreen (JSON v2 Backup/Restore, CSV Export, Sync Delta Status)                   |
+---------------------------------------------------------------------------------------------------+
|  State Management & Contexts:                                                                     |
|  - TransactionsContext  - CategoriesContext  - BudgetsContext  - GoalsContext  - RecurringContext  |
|  - ThemeContext (Dynamic 'system' | 'light' | 'dark' provider with Appearance listener)           |
+---------------------------------------------------------------------------------------------------+
|  Domain Logic & Engines (src/lib/):                                                               |
|  - recurringEngine.ts (Date calculations, month-end pinning, catch-up generators)                 |
|  - goalCalculations.ts (Progress percentages, required monthly savings, status transitions)       |
|  - transactionSearch.ts (Case-insensitive tokenized search, hashtag extractors)                  |
|  - syncEngine.ts (Delta generation, LWW conflict reconciler, tombstone recorder)                  |
|  - analytics.ts & csvExport.ts (Month scopes, RFC 4180 serializers)                               |
+---------------------------------------------------------------------------------------------------+
|  Storage & Data Persistence (src/storage/ - SQLite Schema v4):                                    |
|  - transactions (id, amount_minor, type, category_id, date, description, created_at, updated_at)  |
|  - categories (id, name, type, is_built_in, is_archived, created_at, updated_at)                   |
|  - budgets (id, scope_type, category_id, limit_minor, created_at, updated_at)                     |
|  - recurring_transactions (id, amount_minor, type, category_id, description, frequency, ...)     |
|  - financial_goals (id, title, target_amount_minor, current_saved_minor, target_date, status, ...) |
|  - deleted_tombstones (id, entity_type, entity_id, deleted_at)                                    |
+---------------------------------------------------------------------------------------------------+
```

---

## Database Architecture (Schema v4)

### DDL and Schema v4 Definition

Upgrading from schema v3 to v4 adds timestamps, archival status, recurring transactions, financial goals, and deletion tombstones.

```sql
-- Existing tables altered with new columns:
ALTER TABLE categories ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE categories ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE transactions ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE budgets ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

-- New Table: recurring_transactions
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  description TEXT CHECK (description IS NULL OR length(description) <= 120),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  next_due_date TEXT NOT NULL CHECK (length(next_due_date) = 10),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- New Table: financial_goals
CREATE TABLE IF NOT EXISTS financial_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 60),
  target_amount_minor INTEGER NOT NULL CHECK (target_amount_minor > 0),
  current_saved_minor INTEGER NOT NULL DEFAULT 0 CHECK (current_saved_minor >= 0),
  target_date TEXT CHECK (target_date IS NULL OR length(target_date) = 10),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- New Table: deleted_tombstones
CREATE TABLE IF NOT EXISTS deleted_tombstones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('transaction', 'category', 'budget', 'recurring', 'goal')),
  entity_id INTEGER NOT NULL,
  deleted_at INTEGER NOT NULL
);

-- Indexes for high-frequency queries
CREATE INDEX IF NOT EXISTS idx_categories_type_archived ON categories(type, is_archived);
CREATE INDEX IF NOT EXISTS idx_transactions_updated_at ON transactions(updated_at);
CREATE INDEX IF NOT EXISTS idx_recurring_due_active ON recurring_transactions(is_active, next_due_date);
CREATE INDEX IF NOT EXISTS idx_goals_status ON financial_goals(status);
CREATE INDEX IF NOT EXISTS idx_tombstones_deleted_at ON deleted_tombstones(deleted_at);
```

### Migration Safety & Invariants
1. **Migration Transactionality**: Upgrades from v1, v2, or v3 execute within `BEGIN IMMEDIATE ... COMMIT`. Any failure (e.g., disk I/O, constraint error) immediately issues `ROLLBACK`, leaving existing database tables and `PRAGMA user_version` completely untouched.
2. **Backfill Timestamps**: For existing rows during migration, `updated_at` is seeded with the epoch millisecond equivalent of `created_at` (or `Date.now()` if unparseable).
3. **Idempotence**: Running `initializeSchema` repeatedly on an already migrated v4 database is an idempotent no-op that preserves user version 4.

---

## Pillar 1: Category Management & Reassignment Engine

### 1.1 Category State Machine & Lifecycle
- **Built-in Categories** (`is_built_in = 1`): Permanent fixtures seeded on database creation (e.g., "Other", "Salary", "Food"). Cannot be renamed, deleted, or archived.
- **Custom Categories** (`is_built_in = 0`): Full user control:
  - **Rename**: Must be non-blank, trimmed, <= 40 characters, and case-insensitively unique for the given type (`income` or `expense`).
  - **Archive**: Toggles `is_archived` between `0` and `1`. Archived categories are hidden from the transaction creation/edit dropdowns, but remain visible in History filters, past reports, and category management.
  - **Safe Delete with Reassignment**:
    - Deleting a category that has 0 transactions simply deletes the category row and logs a tombstone.
    - Deleting a category with > 0 linked transactions **requires** specifying a `targetCategoryId`.
    - Constraints on `targetCategoryId`: Must exist, must NOT be archived, must match the same `type` (`income` or `expense`), and must not be the category being deleted.
    - Atomic Execution: Inside a single SQLite transaction:
      ```sql
      UPDATE transactions SET category_id = ?targetCategoryId, updated_at = ?now WHERE category_id = ?categoryIdToDelete;
      DELETE FROM budgets WHERE category_id = ?categoryIdToDelete;
      DELETE FROM categories WHERE id = ?categoryIdToDelete;
      INSERT INTO deleted_tombstones (entity_type, entity_id, deleted_at) VALUES ('category', ?categoryIdToDelete, ?now);
      ```

---

## Pillar 2: Recurring Transaction Scheduler & Engine

### 2.1 Scheduling Engine (`recurringEngine.ts`)
- **Frequencies**: `'daily' | 'weekly' | 'monthly' | 'yearly'`.
- **Date Math & Month-End Pinning**:
  - For `'monthly'` recurring on the 31st: If next month has 30 days (e.g. April 30), or February (28/29), clamp to the last valid day of that month (`YYYY-MM-28/29/30`) without skipping months.
  - Leap year handling: February 29 advances to February 28 on non-leap years.
- **Catch-up Generation**:
  - `findDueRecurringTransactions(schedules: RecurringTransaction[], asOfDate: string): DueRecurringItem[]` identifies schedules where `next_due_date <= asOfDate` and `is_active = 1`.
  - When the user reviews and clicks "Apply", the engine:
    1. Inserts a standard record into `transactions` with `date = next_due_date` (or `asOfDate`).
    2. Advances the schedule's `next_due_date` by its frequency interval.
    3. If `next_due_date` is still in the past (e.g. app was unopened for 2 months), it advances sequentially to prevent infinite loop spam, or queues multi-occurrences with explicit user confirmation.

### 2.2 Dashboard Review Banner
- Located above the summary tiles on `DashboardScreen`.
- If due recurring transactions exist: Shows a high-contrast card: *"2 recurring transactions due (₹15,000.00)"* with two actions:
  - **Apply All**: Instantly creates the transactions and updates due dates.
  - **Review**: Opens a modal list allowing individual confirmation, date adjustments, or snoozing.

---

## Pillar 3: Financial Goals Tracker & Budget Warning Alerts

### 3.1 Financial Goals Domain Logic (`goalCalculations.ts`)
- Fields: `title`, `targetAmountMinor`, `currentSavedMinor`, `targetDate` (optional), `status`.
- Calculations:
  - `percentage = Math.min(100, Math.floor((currentSavedMinor / targetAmountMinor) * 100))`
  - `remainingMinor = Math.max(0, targetAmountMinor - currentSavedMinor)`
  - `projectedMonthlySavingsMinor`: If `targetDate` is set and in the future, calculates `remainingMinor / monthsRemaining`.
- State transitions:
  - Adding savings increases `currentSavedMinor`.
  - If `currentSavedMinor >= targetAmountMinor`, status automatically transitions to `'completed'`.
  - User can manually deposit, withdraw, or cancel a goal.

### 3.2 Budget Warning Thresholds
- On `BudgetsScreen`:
  - `< 80%`: Normal status (Theme Primary / Green).
  - `80% - 99.9%`: **Warning state** — Amber badge and progress tint (`#F59E0B`) with text: *"Approaching limit (85% used)"*.
  - `>= 100%`: **Danger / Overspent state** — Red alert (`#EF4444`) with exact overspent amount.

---

## Pillar 4: Dynamic Theme System & History Tag Search

### 4.1 Theme System (`ThemeContext.tsx`)
- Supported Modes: `'system' | 'light' | 'dark'`.
- Persisted in SQLite settings / local preferences.
- When set to `'system'`, listens to `Appearance.addChangeListener` for instant system mode transitions without requiring an app reload.
- Color Tokens Palette:
  | Token | Light Theme | Dark Theme (WCAG AAA) |
  |---|---|---|
  | `background` | `#F8FAFC` | `#0F172A` |
  | `surface` | `#FFFFFF` | `#1E293B` |
  | `surfaceElevated` | `#FFFFFF` | `#334155` |
  | `textPrimary` | `#0F172A` | `#F8FAFC` |
  | `textSecondary` | `#64748B` | `#94A3B8` |
  | `border` | `#E2E8F0` | `#334155` |
  | `primary` | `#2563EB` | `#3B82F6` |
  | `expense` | `#DC2626` | `#EF4444` |
  | `income` | `#16A34A` | `#22C55E` |
  | `warning` | `#D97706` | `#F59E0B` |

### 4.2 Enhanced History Search & Hashtags (`transactionSearch.ts`)
- Real-time tokenized search bar at top of `HistoryScreen`.
- Substring search across `description`, `categoryName`, and formatted amount.
- **Hashtag parser**: Extracts `#word` tokens from transaction descriptions.
- Dynamic tag chips rendered horizontally above the transaction list: tapping a tag chip filters history to transactions matching that hashtag.

---

## Pillar 5: Cloud Sync Architecture & Tombstones

### 5.1 Tombstone Recording
Whenever any entity (`transaction`, `category`, `budget`, `recurring`, `goal`) is deleted, a record is added to `deleted_tombstones`:
```typescript
interface TombstoneRecord {
  id: number;
  entityType: 'transaction' | 'category' | 'budget' | 'recurring' | 'goal';
  entityId: number;
  deletedAt: number; // epoch ms
}
```

### 5.2 Delta Synchronization Protocol (`KyrosSyncDeltaV1`)
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
```
- **Reconciliation Engine (`syncEngine.ts`)**:
  - Uses Last-Write-Wins (LWW) conflict resolution comparing `updated_at`.
  - Applying a delta is idempotent: applying the same delta multiple times produces identical database state.
  - Tombstones take precedence over older entity records (`deletedAt >= record.updated_at`).

---

## Backup Format Evolution (`KyrosBackupV2`)

To ensure 100% backward compatibility, `KyrosBackupV2` extends `KyrosBackupV1`:
- If restoring a `KyrosBackupV1` file (from Kyros 0.4 or 0.5):
  - Validates according to V1 rules.
  - Automatically seeds missing fields (`is_archived = 0`, `updated_at = created_at`, empty goals, empty recurring).
- If exporting from Kyros 0.6:
  - Produces `KyrosBackupV2` including `recurring`, `goals`, `is_archived`, and `updated_at`.

---

## Delivery Tasks and Milestones

1. **Task 1: Schema Migration v4, Category Management, & Reassignment Engine**
2. **Task 2: Recurring Transaction Scheduler & Dashboard 1-Tap Review**
3. **Task 3: Financial Goals Tracker & Budget Warning Alerts**
4. **Task 4: Dynamic Theme Engine (Dark/Light/System) & History Search/Tags**
5. **Task 5: Cloud Sync Delta Engine, Tombstones, & Backup V2**
6. **Task 6: Release Preparation, Documentation, and Build Verification**

---

## Release Acceptance Criteria

1. **Schema Integrity**: Existing databases from 0.1, 0.2, 0.3, 0.4, and 0.5 upgrade to v4 without error or data alteration.
2. **Category Safety**: Deleting a category with transactions forces reassignment; transactions and reports show the reassigned category.
3. **Recurring Precision**: Due recurring items calculate accurate next dates across month boundaries and leap years, and generate valid transactions with exact paise.
4. **Goal Calculations**: Savings goals calculate progress percentages and monthly savings accurately using integer arithmetic.
5. **Theme Quality**: Full dark mode and light mode tested with high contrast across every screen; system theme changes apply dynamically.
6. **Sync & Backup**: Sync delta serializes all modifications and deletions; Backup V2 exports complete state and restores V1 and V2 backups atomically.
7. **Test Coverage**: All unit tests pass in Bun (`bun test`), TypeScript check passes cleanly (`npm run typecheck`), and native Android APK builds without error.

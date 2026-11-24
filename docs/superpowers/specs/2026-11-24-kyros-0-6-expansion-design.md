# Kyros 0.6 Feature Expansion Design

## Intent

Kyros 0.6 expands the application's capabilities across four core pillars:
1. **Category Management & Recurring Transactions**: Safe renaming, archiving, and deletion of custom categories with transaction reassignment; recurring transaction schedules and automated occurrence application.
2. **Advanced Budgeting & Financial Goals**: Targeted savings goals with deadline tracking, contributions, and progress visualization; warning threshold indicators on monthly budgets.
3. **Connected Features & Cloud Sync Architecture**: Synchronizable data structures with revision tracking, tombstones for deletions, delta payload generation, and offline-first conflict resolution.
4. **Appearance & UI Customization**: System/Dark/Light theme switching with accessible high-contrast palettes, plus full-text description search and tag filtering in history.

All additions preserve Kyros's core invariants: 100% offline-first SQLite operation, integer-paise precision, zero floating-point money calculations, >= 48dp touch targets, and atomic data safety.

---

## Architecture and Core Pillars

```
+----------------------------------------------------------------------------------+
|                                    Kyros 0.6                                     |
+----------------------------------------------------------------------------------+
|  1. Category Mgmt       2. Recurring Engine    3. Goals & Budgets    4. Themes   |
|  - Rename custom cat    - Daily/Weekly/Month   - Target amount       - Dark/Light|
|  - Archive / unarchive  - 1-tap review & apply - Deadline tracking   - Search/Tag|
|  - Reassign on delete   - Due date tracker     - Progress bars       - System pref|
+----------------------------------------------------------------------------------+
|  5. Cloud Sync Protocol & Delta Engine (Offline-First SQLite Foundation)         |
|  - Schema v4: updated_at, is_archived, tombstones table                          |
|  - Delta generation (changes since timestamp) & conflict resolution              |
+----------------------------------------------------------------------------------+
```

---

## 1. Category Management & Recurring Transactions

### 1.1 Category Management
- **Safe Rename**: Custom categories can be renamed at any time. Renaming preserves category ID and updates all linked transactions and category budgets immediately.
- **Archival**: Custom categories can be marked `is_archived = 1`. Archived categories are hidden from the Add/Edit transaction pickers, but remain visible in historical reports, charts, and transaction history.
- **Safe Deletion with Reassignment**: Deleting a custom category requires selecting an active replacement category of the same type. All transactions referencing the old category ID are re-assigned in a single atomic SQLite transaction before the category row is removed. Built-in categories cannot be deleted or renamed.

### 1.2 Recurring Transactions
- Users can register recurring templates for recurring income (e.g., monthly salary, stipend) or recurring expenses (e.g., rent, gym, subscriptions).
- Schema:
  - `frequency`: `'daily' | 'weekly' | 'monthly' | 'yearly'`
  - `amount_minor`: integer paise
  - `category_id`: foreign key
  - `next_due_date`: `YYYY-MM-DD`
  - `is_active`: `1` (active) or `0` (paused)
- **Review and Apply**: When the app opens, an alert banner on the Dashboard identifies pending due transactions. Users can apply them with 1 tap or dismiss/snooze them. Applied transactions enter the standard `transactions` table with today's date, advancing `next_due_date`.

---

## 2. Advanced Budgeting & Financial Goals

### 2.1 Savings Goals Tracker
- Users define savings goals (e.g., "Emergency Fund", "Down Payment", "Vacation").
- Fields:
  - `title`: string (1-60 chars)
  - `target_amount_minor`: integer paise (> 0)
  - `current_saved_minor`: integer paise (>= 0)
  - `target_date`: `YYYY-MM-DD` (optional target deadline)
  - `status`: `'active' | 'completed' | 'cancelled'`
- Visual progress bar indicates percentage saved, remaining rupees to reach the target, and daily/monthly savings required to hit the deadline.

### 2.2 Budget Warning Thresholds
- On the Budgets tab, visual indicators warn users when spending hits 80% (Warning / Amber) or exceeds 100% (Danger / Red) of the monthly limit.

---

## 3. Connected Features & Cloud Sync Engine

### 3.1 Synchronizable Schema (v4 Migration)
- Add `updated_at INTEGER NOT NULL` (millisecond timestamp) to `transactions`, `categories`, and `budgets`.
- Add `deleted_tombstones` table:
  - `id INTEGER PRIMARY KEY AUTOINCREMENT`
  - `entity_type TEXT NOT NULL` (`'transaction' | 'category' | 'budget' | 'goal' | 'recurring'`)
  - `entity_id INTEGER NOT NULL`
  - `deleted_at INTEGER NOT NULL`
- Every delete operation inserts a tombstone record so deletions synchronize correctly across devices.

### 3.2 Delta Serialization & Conflict Resolution
- `generateSyncDelta(lastSyncTimestamp)`: exports records created or updated after `lastSyncTimestamp` along with tombstones.
- `applySyncDelta(payload)`: applies remote changes using Last-Write-Wins (LWW) resolution based on `updated_at`, without ever overwriting a newer local edit.

---

## 4. Appearance & UI Customization

### 4.1 Theme System (Dark / Light / System)
- Theme modes: `'system' | 'light' | 'dark'`.
- Dynamic `ThemeProvider` and `useTheme()` hook delivering semantic tokens:
  - Backgrounds, surfaces, cards, borders, text primary/secondary, accents, status colors.
  - WCAG AAA compliance for text contrast on dark backgrounds.
- Preference persisted in device storage.

### 4.2 Enhanced Transaction Search & Tags
- Real-time search filter on `HistoryScreen`:
  - Matches case-insensitive substrings in descriptions and category names.
  - Supports `#tag` extraction (e.g., `#groceries`, `#trip2026`) with quick-filter tag chips.

---

## Delivery Slices

1. **Slice 1: Schema Migration v4, Category Management, & Reassignment Engine**
   - Migration v4 (`is_archived`, `updated_at`, `deleted_tombstones`, `recurring_transactions`, `financial_goals`).
   - Category rename, archive, and atomic reassign-delete in `categoryStorage.ts`.
   - Category management screen & modals.

2. **Slice 2: Recurring Transaction Engine & Dashboard Review Flow**
   - Recurring storage module & due date calculation engine.
   - Recurring transaction manager screen & dashboard due review banner.

3. **Slice 3: Financial Goals Tracker & Budget Warning Thresholds**
   - Savings goals storage, progress calculator, and goal creation/management screens.
   - 80% warning and 100% danger indicators on budget progress cards.

4. **Slice 4: Dynamic Theme Engine (Dark/Light) & Tag Search**
   - Theme context with dark/light palettes, system scheme listener, and user toggle.
   - Real-time search and hashtag filter chips in History screen.

5. **Slice 5: Cloud Sync Delta Engine & Tombstone Tracker**
   - Tombstone recording, delta payload generator, and sync reconciliation logic with comprehensive unit tests.

6. **Slice 6: Release Preparation, Documentation, and Build Verification**
   - Version bump to 0.6.0, release notes, README updates, full test verification, and wiki documentation.

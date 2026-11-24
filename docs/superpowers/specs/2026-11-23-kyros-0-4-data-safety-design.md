# Kyros 0.4 Local Data Safety and Quality Design

## Intent

Kyros 0.4 delivers local data safety, reliable backup and restore, and accessibility improvements across the application. It empowers users to export and import their financial records (transactions, categories, and budgets) in a portable, human-readable, and versioned JSON format using Android's native Storage Access Framework, without relying on external cloud services or network connectivity. It also enhances application-wide accessibility and layout resilience.

## Goals

- Provide user-controlled local backup (export) and restore (import) for all transactions, categories, and budgets.
- Use a versioned, portable JSON backup format that validates schema and data integrity before importing.
- Ensure restore is atomic and rollback-safe: either all data restores cleanly or the existing database remains completely unchanged.
- Make replacement of on-device data explicit through clear confirmation dialogs, previewing record counts, and recommending a backup of current data before overwriting.
- Integrate Data Management into the navigation hierarchy via a 5th bottom tab ("Data").
- Implement Android document creation and opening using Android's Storage Access Framework (SAF) without adding external npm dependencies.
- Improve accessibility (accessible labels, touch targets >= 48dp, screen reader semantics) and text scale resilience across core screens.
- Keep the app fully functional offline, preserving integer-paise financial precision and all invariants established in versions 0.1 through 0.3.

## Non-goals

- Cloud sync, user accounts, authentication, or remote backend storage (deferred to 0.5+).
- Automatic background backups or scheduled sync.
- Selective or partial merge of backup records (atomic full replace selected to prevent duplicate or orphaned financial state).
- Desktop or iOS platform support (Android remains the target platform).

## Constraints and Invariants

- Android minimum version remains Android 7.0 (API 24).
- Storage Access Framework (`ACTION_CREATE_DOCUMENT` and `ACTION_OPEN_DOCUMENT`) is used for user-directed file saving and loading without requiring runtime storage permissions.
- SQLite remains the on-device source of truth. Restoring data executes inside a single database transaction (`BEGIN IMMEDIATE` ... `COMMIT` / `ROLLBACK`).
- All financial values in backup files must be validated as positive, safe integer minor units (paise). Invalid amounts, missing categories, orphaned foreign keys, or duplicate scopes cause immediate rejection before touching the database.
- Built-in categories ("Other", etc.) must be preserved or restored so existing transactions remain valid.
- Zero extra third-party npm packages: native file interactions are implemented via lightweight Kotlin Android modules following the established `KyrosSQLiteModule` pattern.
- In accordance with repository release rules (`AGENTS.md`), every release to `main` must update release notes, documentation, and the published GitHub wiki.

## Approaches Evaluated

1. **Versioned JSON with Atomic Replace via Storage Access Framework (Selected):**
   - Export all tables to a structured JSON file with metadata (`version: 1`, `appVersion: "0.4.0"`, `exportedAt`, `counts`).
   - Validate every entity strictly before initiating a database transaction.
   - Present a clear pre-restore summary (counts of transactions, categories, budgets) and confirmation dialog.
   - Execute replacement atomically inside SQLite; any error triggers `ROLLBACK` and restores previous state.
   - Advantages: Human-readable, portable across schema changes, inspectable by users, zero risk of partial database corruption.

2. **Raw SQLite Database File Snapshot:**
   - Copy `kyros.sqlite` to and from external storage.
   - Disadvantages: Requires closing active database connections, risks corruption if swapped while handles are open, lacks fine-grained validation against tampered or incompatible schemas, and is opaque to the user.

3. **Incremental / Merge Restore:**
   - Attempt to de-duplicate and merge imported records with existing records.
   - Disadvantages: Complex conflict resolution when category IDs, budget scopes, or transaction timestamps collide; risks double-counting financial transactions.

## Proposed Experience

### 1. Navigation & Data Management Screen
- A new 5th tab on the bottom bar labeled **Data** (icon `⛁`).
- Displays a summary of current stored records:
  - Total Transactions (count, split into Income and Expense)
  - Total Categories (built-in and custom)
  - Configured Budgets (overall limit and category limits)
  - Last backup timestamp (if performed during current session or persisted)
- Action buttons:
  - **Export Backup:** Generates `kyros-backup-YYYY-MM-DD.json` and opens Android document picker to save anywhere (Downloads, Documents, Drive, etc.).
  - **Restore Backup:** Opens Android document picker to select a backup file.

### 2. Restore Safety Flow
- When a file is selected:
  1. The file content is read and validated against the `KyrosBackupV1` schema.
  2. If validation fails: An error dialog clearly states why the backup file was rejected (e.g., malformed JSON, invalid amounts, unmapped categories). Existing data is untouched.
  3. If validation succeeds: A confirmation dialog displays the backup timestamp and record counts (e.g., "Restore 42 transactions, 14 categories, 3 budgets?"). It warns that existing device data will be replaced and prompts to export current data first.
  4. Upon user confirmation: An atomic transaction replaces existing records. On success, the in-memory `TransactionsContext` reloads and a success banner is displayed.

### 3. Accessibility & Layout Quality
- Touch targets: All buttons, icons, filters, and picker items have a minimum touch target size of 48×48 dp.
- Accessibility labels: Comprehensive `accessibilityLabel`, `accessibilityRole`, and `accessibilityHint` attributes for screen readers.
- Font scaling: Screens wrap in `ScrollView` with responsive paddings and `flexWrap` for badges and summary tiles so text scaling (`fontScale > 1.0`) does not truncate labels.

## Delivery Slices

1. **Slice 1: Backup format, serialization, validation, and safe atomic restore in storage**
   - Schema types, JSON serialization/deserialization, strict data validators, and SQLite transactional restore function. Unit tests with Bun.
2. **Slice 2: Android native file bridge using Storage Access Framework**
   - Kotlin module `KyrosFileModule` supporting document creation (`ACTION_CREATE_DOCUMENT`) and document opening (`ACTION_OPEN_DOCUMENT`). TypeScript interface and testable fallback bridge.
3. **Slice 3: Data Management screen, bottom tab navigation, and context integration**
   - Add 5th "Data" tab, `DataManagementScreen`, record summary cards, export flow, and confirmation-guarded restore flow with context reload.
4. **Slice 4: Application-wide accessibility and layout resilience**
   - Audit and upgrade accessibility labels, roles, hints, touch targets (>= 48dp), and font scaling across all screens and components.
5. **Slice 5: Release preparation, Android build verification, and documentation**
   - Bump version to 0.4.0, write `release-notes/v0.4.0.md`, update `README.md`, verify tests, typecheck, and release build.
6. **Slice 6: Published GitHub wiki review and verification**
   - Review and update affected GitHub wiki pages with backup/restore instructions and accessibility details after release to `main`.

## Release Acceptance

- Backing up representative data produces a valid, readable JSON file containing all transactions, categories, and budgets.
- Restoring on a fresh install or an existing database reproduces the exact transaction amounts, dates, categories, and budgets.
- Corrupted or invalid backup payloads are rejected without altering the database.
- Confirmation is required before replacing data, with an option to backup current data first.
- Automated tests pass (storage, validation, serialization, restore rollback).
- TypeScript check passes (`npm run typecheck`).
- Android release APK builds and installs cleanly; upgrading from v0.3.0 retains all data.
- Documentation, release notes, and GitHub wiki align with released behavior.

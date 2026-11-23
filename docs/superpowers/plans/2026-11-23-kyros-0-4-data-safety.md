# Kyros 0.4 Local Data Safety and Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task by task. Use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Kyros 0.4 with user-controlled local backup and restore (versioned JSON via Android Storage Access Framework), atomic rollback-safe database restoration, a 5th "Data" navigation tab, and app-wide accessibility and layout resilience improvements.

**Architecture:** Extend SQLite storage with a transactional backup export and restore engine that validates envelope, schema, minor units, and relational integrity. Add a lightweight native Android module (`KyrosFileModule`) implementing SAF document creation and opening. Integrate data management into a new "Data" tab within `AppNavigator`, reload state through `TransactionsContext`, and enhance accessibility across all existing screens.

**Tech Stack:** React Native 0.88, TypeScript 6, React Navigation bottom tabs, Android SQLite & SAF modules (Kotlin), Bun tests, Gradle, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-23-kyros-0-4-data-safety-design.md`

## Global Constraints

- Android remains the supported platform, minimum Android 7.0 (API 24).
- SQLite remains the on-device source of truth. Restore operations execute inside an atomic transaction that rolls back completely on any failure or validation error.
- All amounts in backup payloads must be strictly validated as positive, safe integer paise.
- Built-in categories must never be lost or orphaned during restore.
- No additional third-party npm packages; native file picker and saver implemented in Kotlin via Storage Access Framework (`ACTION_CREATE_DOCUMENT` / `ACTION_OPEN_DOCUMENT`).
- All interactive UI elements must provide accessible roles, labels, hints, and maintain touch targets of at least 48×48 dp.
- Before reaching `main`, add versioned release notes (`release-notes/v0.4.0.md`) and update guidance. Review and update the published GitHub wiki upon release.

## Review Focus

- **Backup export completeness:** Exported JSON includes all transactions, categories (built-in and custom), and budgets with metadata and integer paise.
- **Backup validation rigor:** Reject invalid JSON, tampered envelopes, negative/malformed amounts, missing categories, orphaned foreign keys, or duplicate scopes before any database write.
- **Atomic rollback on failure:** Injected errors during restore must leave existing transactions, categories, and budgets 100% intact.
- **Explicit user confirmation:** Restore flow displays record counts and warns that device data will be replaced, with an option to backup first.
- **Accessibility standards:** Verify accessibility labels, roles, and >= 48dp touch targets on all screens.

---

### Task 1: Backup format, serialization, validation, and safe atomic restore in storage

**Files:**
- Create: `src/storage/backupStorage.ts`
- Create: `src/storage/backupValidation.ts`
- Modify: `src/storage/types.ts`
- Modify: `src/storage/index.ts`
- Create: `tests/backupValidation.test.ts`
- Create: `tests/backupStorage.test.ts`

**Interfaces:**
- `KyrosBackupPayloadV1`:
  ```typescript
  export interface KyrosBackupMetadata {
    version: 1;
    appVersion: string;
    exportedAt: string; // ISO 8601
  }
  export interface BackupCategory {
    id: number;
    type: 'income' | 'expense';
    name: string;
    isBuiltin: boolean;
  }
  export interface BackupTransaction {
    id: number;
    type: 'income' | 'expense';
    amountMinor: number;
    date: string;
    description: string | null;
    createdAt: number;
    categoryId: number;
  }
  export interface BackupBudget {
    id: number;
    categoryId: number | null;
    amountMinor: number;
  }
  export interface KyrosBackupData {
    categories: BackupCategory[];
    transactions: BackupTransaction[];
    budgets: BackupBudget[];
  }
  export interface KyrosBackupV1 {
    meta: KyrosBackupMetadata;
    data: KyrosBackupData;
  }
  ```
- `validateBackupPayload(raw: unknown): KyrosBackupV1`
- `exportBackupData(db: SQLiteDatabaseLike): Promise<KyrosBackupV1>`
- `restoreBackupData(db: SQLiteDatabaseLike, backup: KyrosBackupV1): Promise<{ transactionsCount: number; categoriesCount: number; budgetsCount: number }>`

- [ ] **Step 1: Add validation tests for backup payloads**
  Add unit tests in `tests/backupValidation.test.ts` checking: valid backup payload acceptance, rejection of invalid JSON/envelopes, rejection of negative or non-integer paise, rejection of unknown/mismatched category IDs in transactions and budgets, rejection of multiple overall budgets or duplicate category budgets, and rejection of budgets referencing income categories.

- [ ] **Step 2: Run validation tests to confirm failure**
  Run: `bun test tests/backupValidation.test.ts`
  Expected: fails due to missing modules.

- [ ] **Step 3: Implement backup validation logic**
  Implement `validateBackupPayload` in `src/storage/backupValidation.ts` with comprehensive checks and informative error messages.

- [ ] **Step 4: Add backup export and atomic restore tests**
  Add integration tests in `tests/backupStorage.test.ts`:
  - `test_export_backup_captures_all_current_data`
  - `test_restore_backup_replaces_all_tables_atomically`
  - `test_restore_backup_rolls_back_completely_on_error`
  - `test_restore_preserves_builtin_categories`

- [ ] **Step 5: Implement backup storage export and restore**
  Implement `exportBackupData` and `restoreBackupData` in `src/storage/backupStorage.ts`. Use a single atomic transaction (`BEGIN` ... `COMMIT` / `ROLLBACK`). Ensure all existing rows are cleared and replaced cleanly. Re-seed any missing built-in categories.

- [ ] **Step 6: Run tests and typecheck**
  Run: `bun test tests/backupValidation.test.ts tests/backupStorage.test.ts` and `npm run typecheck`.

---

### Task 2: Android native file bridge with Storage Access Framework (SAF)

**Files:**
- Create: `android/app/src/main/java/com/kyros/app/KyrosFileModule.kt`
- Modify: `android/app/src/main/java/com/kyros/app/KyrosSQLitePackage.kt` (or create `KyrosFilePackage.kt`)
- Modify: `android/app/src/main/java/com/kyros/app/MainApplication.kt`
- Create: `src/lib/fileBridge.ts`
- Create: `tests/fileBridge.test.ts`

**Interfaces:**
- Native methods:
  - `createDocument(suggestedName: String, mimeType: String, content: String, promise: Promise)`
  - `openDocument(mimeType: String, promise: Promise)`
- TypeScript wrapper:
  ```typescript
  export interface FileBridge {
    saveBackupFile(suggestedName: string, jsonString: string): Promise<boolean>;
    pickBackupFile(): Promise<string | null>;
  }
  ```

- [ ] **Step 1: Implement Android KyrosFileModule**
  In Kotlin, create `KyrosFileModule` using `ActivityEventListener` to handle `ACTION_CREATE_DOCUMENT` and `ACTION_OPEN_DOCUMENT` intents cleanly. Write content via `contentResolver.openOutputStream(uri)` and read content via `contentResolver.openInputStream(uri)`. Return null or false if cancelled by user.

- [ ] **Step 2: Register KyrosFileModule in Android application**
  Register the package in `MainApplication.kt` so React Native can access `NativeModules.KyrosFile`.

- [ ] **Step 3: Create TypeScript bridge with fallback support**
  In `src/lib/fileBridge.ts`, wrap `NativeModules.KyrosFile`. Provide graceful fallback and clear error reporting.

- [ ] **Step 4: Add fileBridge tests**
  Add mock tests in `tests/fileBridge.test.ts` verifying proper handling of file saving, file reading, cancellation, and error handling.

- [ ] **Step 5: Run tests and typecheck**
  Run: `bun test tests/fileBridge.test.ts` and `npm run typecheck`.

---

### Task 3: Data Management screen and 5th bottom tab navigation

**Files:**
- Modify: `src/navigation/types.ts`
- Modify: `src/navigation/AppNavigator.tsx`
- Modify: `src/state/TransactionsContext.tsx`
- Create: `src/screens/DataManagementScreen.tsx`
- Create: `tests/dataManagementScreen.test.ts`

**Interfaces:**
- Add `Data: undefined;` to `RootTabParamList`.
- Add `reloadAll(): Promise<void>` in `TransactionsContext`.
- Add `DataManagementScreen` with:
  - Database summary (total transactions, categories, budgets)
  - "Export Backup" button with feedback
  - "Restore Backup" button with confirmation modal/alert previewing record counts and offering pre-restore export
  - Informative error banners and success messages

- [ ] **Step 1: Update TransactionsContext with reloadAll**
  Expose a method in `TransactionsContext` that reloads transactions, categories, and budgets concurrently so UI updates immediately upon restore.

- [ ] **Step 2: Add Data tab to navigation**
  Update `types.ts` and `AppNavigator.tsx` to include `Data` with icon `⛁`.

- [ ] **Step 3: Implement DataManagementScreen**
  Implement the screen with accessible cards for record counts, Backup and Restore buttons, confirmation dialog, and error states.

- [ ] **Step 4: Add tests for DataManagement logic**
  Add tests in `tests/dataManagementScreen.test.ts` verifying confirmation dialog parameters, pre-restore backup recommendations, and error handling.

- [ ] **Step 5: Run tests and typecheck**
  Run: `bun test` and `npm run typecheck`.

---

### Task 4: Application-wide accessibility and layout resilience

**Files:**
- Modify: `src/components/TransactionForm.tsx`
- Modify: `src/components/TransactionList.tsx`
- Modify: `src/components/TransactionRow.tsx`
- Modify: `src/components/CategoryPicker.tsx`
- Modify: `src/components/BudgetForm.tsx`
- Modify: `src/screens/DashboardScreen.tsx`
- Modify: `src/screens/BudgetsScreen.tsx`
- Modify: `src/screens/HistoryScreen.tsx`
- Modify: `src/screens/AddTransactionScreen.tsx`
- Modify: `src/screens/DataManagementScreen.tsx`
- Create: `tests/accessibility.test.ts`

- [ ] **Step 1: Audit and enhance accessibility props**
  Ensure all buttons and inputs have `accessible={true}`, explicit `accessibilityRole`, descriptive `accessibilityLabel`, and clear error announcements.

- [ ] **Step 2: Guarantee minimum 48dp touch targets**
  Add `minHeight: 48` / `minWidth: 48` or `hitSlop` to all buttons, chips, filter tabs, and picker items.

- [ ] **Step 3: Ensure layout resilience for dynamic text scales**
  Ensure text wraps gracefully with `flexWrap`, `ScrollView`, and avoiding fixed-height containers that clip scaled fonts.

- [ ] **Step 4: Add accessibility test assertions**
  Add tests in `tests/accessibility.test.ts` ensuring critical components expose valid accessibility roles and labels.

- [ ] **Step 5: Run tests and typecheck**
  Run: `bun test` and `npm run typecheck`.

---

### Task 5: Release preparation, Android build, upgrade verification, and documentation

**Files:**
- Modify: `package.json` (bump version to 0.4.0)
- Modify: `android/app/build.gradle` (bump versionCode to 4, versionName to "0.4.0")
- Create: `release-notes/v0.4.0.md`
- Modify: `README.md`
- Modify: `plan.md` (mark 0.4 progress)

- [ ] **Step 1: Update version numbers**
  Update version in `package.json` and `android/app/build.gradle`.

- [ ] **Step 2: Write release notes**
  Create `release-notes/v0.4.0.md` detailing local backup & restore, versioned JSON format, atomic restore safety, Data tab, and accessibility improvements.

- [ ] **Step 3: Update README and documentation**
  Update `README.md` with data management instructions and accessibility features.

- [ ] **Step 4: Verify test suite, typecheck, and Android build**
  Run full test suite: `bun test`
  Run typecheck: `npm run typecheck`
  Run Android build check if environment permits.

---

### Task 6: Published GitHub wiki review and verification

**Scope:**
- Review existing GitHub wiki pages against Kyros 0.4.0 changes.
- Update pages covering Data Safety, Backup & Restore, Navigation, and Accessibility.
- Verify published wiki pages after release to `main`.

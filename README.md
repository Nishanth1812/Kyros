# Kyros

Kyros 1.0.0 is a local-first Android app for recording, organizing, and reviewing
income and expenses, with budgets, savings goals, recurring schedules, analytics,
and versioned local backups. Financial data stays in on-device SQLite and money is
stored as integer paise. No account, network, or backend is required.

## Features (1.0)

- **Visual analytics and trends:** explore 6-month income vs. expense trajectories with
  a stated scale and exact values, proportional category spending distribution, daily
  average spend, and savings rates. A deficit shows a negative rate; a month with no
  income shows "Not available".
- **Historical month navigation:** review past months on the Dashboard with instant
  recalculation of income, expenses, and category breakdown, plus a one-tap current-month return.
- **CSV spreadsheet export:** export complete transaction history to standard comma-separated
  (`.csv`) spreadsheet files using Android's native Storage Access Framework in Settings → Data Safety.
- **Local backup and restore:** safely export and restore all transactions, categories, and
  budgets as portable, versioned JSON with atomic rollback safety.
- **Explicit restore confirmation:** view record counts and export dates before
  restoring, with an option to back up existing data before replacing it.
- **Categories:** built-in income and expense categories plus your own custom
  categories can be selected when adding or editing a transaction. Rename and
  archive custom categories; delete them with transaction and schedule reassignment.
- **Edit and delete:** correct an entry in place; deleting asks for confirmation
  and never removes its category or the other transactions.
- **History filters:** narrow the newest-first list by type, category, and an
  inclusive date range, with a clear-filters action.
- **Dashboard:** lifetime net balance, monthly income and expense totals, and category
  breakdowns derived on-the-fly from saved transactions.
- **Budgets:** set recurring monthly limits for all expenses and for individual
  expense categories, then see spent, remaining, and over-budget amounts on the Budgets tab.
  Warnings appear at 80% and the over-limit state appears at 100%.
- **Recurring transactions:** create daily, weekly, monthly, or yearly schedules,
  review due items on the Dashboard, and apply selected entries to history.
- **Savings goals:** save targets with optional deadlines, track deposits and
  withdrawals, and see progress and the monthly amount needed to reach a target.
- **Settings and appearance:** choose system, light, or dark appearance in Settings, a
  secondary screen reachable from every primary tab. Settings also provides access to
  data tools and shows the app version, with no account or sync controls.
- **History search:** search transaction descriptions, category names, and amounts, or
  filter by `#tags`.
- **Consistent navigation:** Dashboard, Add, History, and Budgets are the four
  bottom tabs. Data Safety opens from Settings. Analytics, recurring transactions, goals, and category management open as
  secondary screens and return with the in-app back action or Android system Back.
- **Readable backups:** new local JSON backups record the app version that created them
  (1.0.0); V1 backups remain restorable.
- **Responsive screens:** all tabs and nested screens respect safe areas, stay
  centered on wider displays, and keep actions usable on narrow phones in both
  light and dark themes.
- **Accessibility & Quality:** interactive controls use a shared 48×48 dp minimum
  target, with descriptive accessibility labels and roles and responsive layout scaling.
- **Sync readiness:** export and apply timestamped local deltas with conflict
  handling and deletion markers. There is no cloud transport; SQLite stays on-device.
- **Backup V2:** backups include goals, recurring schedules, category state,
  timestamps, and deletion markers. V1 backups remain supported.

## Development

Requirements: Node.js 22.13+ (Node 24 works), npm, Bun for tests, and an Android
SDK/device or emulator for a native run. CI runs Gradle on JDK 21 and uses the
JDK 17 toolchain selected by React Native for compilation.

```bash
npm install
npm run start          # React Native Metro server
npm run android        # build and launch the native Android app
npm run typecheck      # tsc --noEmit
npm test               # bun test tests
```

The React Native Android project lives in `android/`. Release builds require an
external keystore and credentials; see [ANDROID_RELEASE.md](ANDROID_RELEASE.md).

## Automated checks and releases

GitHub Actions uses one push-only workflow on `dev` and `main`. Tests and the
TypeScript check run once per push. An Android debug build runs on `dev`; pushes
to `main`, including merges from `dev`, instead build, verify, and upload a
signed APK on GitHub Releases. The debug APK is uploaded from `dev` for pre-release
feature testing and includes arm64 devices plus x86_64 emulators. Signed
releases retain all four configured ABIs. The release keystore and its
passwords are held as encrypted GitHub Actions repository secrets, available
only to the release job.
Both Android jobs cache Gradle dependencies and reusable task outputs across
runs.
The workflow decodes the keystore into a temporary file and supplies passwords
through environment variables. Back up the keystore outside GitHub so future
upgrades stay signed with the same key. Debug builds use the standard template
key and need none of this. See
[ANDROID_RELEASE.md](ANDROID_RELEASE.md) for setup, release steps, and versioning
rules. Each verified main release gets an annotated `vX.Y.Z` tag; rerunning the
same commit reuses its version. The first release on a new version line uses the
exact source version. Kyros 1.0.0 follows `v0.6.2` (versionCode 12), so CI
publishes it with versionCode 13.

## Structure

```
src/
  storage/       amounts, validation, schema, categories, budgets, goals, backup and sync storage
  lib/           database setup, INR money, dates, filters, summaries and domain calculations
  state/         shared transaction, budget, goal and recurring state
  navigation/    bottom tabs (Dashboard, Add, History, and Budgets) and a native stack for Settings, Data, Analytics, Recurring, Goals, and Categories
  components/    transaction and budget forms, category picker, edit modal, filters, row, list, charts, and shared states
  screens/       Dashboard, Add, History, Budgets, Data, Settings, Analytics, Recurring, Goals, and Category management screens
  theme/         system/light/dark palettes, persisted theme mode, spacing and typography
App.tsx            providers and root navigator
index.ts           React Native root component registration
```

## Product decisions

- **Currency:** INR only, provisionally. Amounts are stored as integer paise
  (1 rupee = 100 paise) and displayed with `en-IN` formatting (₹). The form accepts
  rupees with up to two decimals and converts them to paise before any write, so
  no floating-point money ever reaches SQLite. There is no currency conversion;
  widening this to multiple currencies is a later release decision.
- **Categories:** a category belongs to one transaction type; custom names are
  unique per type without regard to case. Built-ins are seeded on first run and
  cannot be renamed, archived, or deleted. Deleting a custom category reassigns
  transactions and recurring schedules and records removed budgets for sync.
- **Dashboard periods:** the dashboard shows lifetime net balance (all income
  minus all expenses), current-calendar-month income and expense totals, and
  current-month expenses by category. The month follows the device's local date.
- **Savings rate:** derived from the selected month's income and expenses in
  integer paise as `(income - expenses) / income * 100`. A deficit produces a
  negative percentage and a month with no income shows "Not available" instead
  of 0%; both are shown on Dashboard and Analytics.
- **Backups:** new local JSON exports record the running app version from the
  package manifest (1.0.0) in metadata. The backup format and restore rules are
  unchanged, and older backups remain restorable.
- **Budgets:** limits recur each local calendar month and are saved as positive
  integer paise. Progress is derived only from expense transactions in the
  current local month (first through last day, inclusive), so income is excluded
  and actuals are never stored. A warning appears at 80%; over-limit status and
  exact overspend appear at 100%. The visual bar caps at 100%. There is at most
  one overall limit and one per expense category, with no rollover.
- **Android range:** minimum Android 7.0 (API 24), with portrait layout.
  Package `com.kyros.app`, source `versionCode` 9,
  `versionName` 1.0.0. CI derives published version codes from release tags.
- **Ordering:** the storage layer sorts by date, then creation time, then id,
  all descending, so the newest entry is always first.
- **Migration:** the app migrates supported SQLite databases through schema v4
  in place. The v3-to-v4 migration adds revision timestamps, category archival,
  recurring schedules, goals, and deletion markers transactionally. Failure
  leaves data and schema version intact. Earlier migrations preserve rows.
- **Backup compatibility:** V1 backups restore with defaults for fields that
  did not exist; V2 backups replace categories, transactions, budgets, recurring
  schedules, goals, and deletion markers atomically.
- **Offline:** all core reads and writes use the local `kyros.sqlite` database;
  the delta engine does not send data over a network. Android automatic backup
  is disabled; make a user-controlled export before uninstalling or replacing a device.

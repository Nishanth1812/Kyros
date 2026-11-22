# Kyros

Kyros 0.2 is a local-first Android app for recording, organizing, and reviewing
income and expenses. Entries live in on-device SQLite, are stored as integer minor
units, and can be grouped by category, corrected, filtered, and summarized on a
dashboard. No account, network, or backend is required.

## Features (0.2)

- **Categories:** built-in income and expense categories plus your own custom
  categories can be selected when adding or editing a transaction.
- **Edit and delete:** correct an entry in place; deleting asks for confirmation
  and never removes its category or the other transactions.
- **History filters:** narrow the newest-first list by type, category, and an
  inclusive date range, with a clear-filters action.
- **Dashboard:** lifetime net balance, current-month income and expense totals,
  and current-month expenses by category, all derived from saved transactions.
- **Local migration:** existing 0.1 databases are upgraded in place; every saved
  transaction is kept and assigned to its type's `Other` category.

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
same commit reuses its version. The first release on a new minor line uses that
line's exact source version, so advancing from 0.1.x to source 0.2.0 produces
`v0.2.0`; later 0.2.x releases increment the patch.

## Structure

```
src/
  storage/       amounts, validation, schema, categories and SQLite access (shared module)
  lib/           database setup, INR money, date helpers, filters and summaries
  state/         transactions and categories context: loading / error / data and mutations
  navigation/    bottom tabs (Dashboard, Add and History)
  components/    transaction form, category picker, edit modal, filters, row, list, and states
  screens/       AddTransactionScreen, HistoryScreen and DashboardScreen
  theme/         shared colours, spacing, radius and typography
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
  unique per type without regard to case. Built-ins are seeded on first run;
  category rename/removal is deferred. Removing a category in a future release
  must preserve its linked transactions.
- **Dashboard periods:** the dashboard shows lifetime net balance (all income
  minus all expenses), current-calendar-month income and expense totals, and
  current-month expenses by category. The month follows the device's local date.
- **Android range:** minimum Android 7.0 (API 24), with portrait layout.
  Package `com.kyros.app`, base `versionCode` 3,
  `versionName` 0.2.0. CI tag `versionCode` values are derived from release tags.
- **Ordering:** the storage layer sorts by date, then creation time, then id,
  all descending, so the newest entry is always first.
- **Migration:** a v1-to-v2 SQLite migration upgrades existing 0.1 databases in
  place, keeping every transaction's ID, amount, type, date, description, and
  creation time. Migrated rows get the matching type's `Other` category and can
  be recategorized by editing. The migration is transactional: a failure leaves
  the original data and schema version intact.
- **Offline:** all reads and writes use the local `kyros.sqlite` database on the
  device; the app makes no network requests. Android automatic backup is disabled;
  data is lost if the app is uninstalled or the device is lost.

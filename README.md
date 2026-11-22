# Kyros

Kyros 0.1 is a local-first Android app for recording income and expenses. Entries
live in on-device SQLite, are stored as integer minor units, and are shown newest
first. No account, network, or backend is required.

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
same commit reuses its version.

## Structure

```
src/
  storage/       amounts, validation, schema and SQLite access (shared module)
  lib/           database setup, INR money formatting/parsing, date helpers
  state/         transactions context: loading / error / data and add/refresh
  navigation/    bottom tabs (Add and History)
  components/    transaction form, row, list, and loading/error/empty states
  screens/       AddTransactionScreen and HistoryScreen
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
- **Android range:** minimum Android 7.0 (API 24), with portrait layout.
  Package `com.kyros.app`, base `versionCode` 1,
  `versionName` 0.1.0.
- **Ordering:** the storage layer sorts by date, then creation time, then id,
  all descending, so the newest entry is always first.
- **Offline:** all reads and writes use the local `kyros.sqlite` database on the
  device; the app makes no network requests. Android automatic backup is disabled;
  data is lost if the app is uninstalled or the device is lost.

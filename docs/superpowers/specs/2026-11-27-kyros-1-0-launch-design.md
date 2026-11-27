# Kyros 1.0.0 Launch Design

## Intent

Launch Kyros 1.0.0 as its first stable major release. The 1.0 candidate is the
local-first app with the approved product-readiness work now implemented on `dev`:
clearer screens and charts, a dedicated Settings screen, consistent secondary
navigation, accessible controls, and corrected savings-rate and backup-version
behavior. Distribution stays the existing signed APK through GitHub Releases.
There is no account, cloud sync, or network feature in 1.0.

## Goals

- Publish `v1.0.0` as a signed Android APK through the existing GitHub Releases workflow.
- Preserve the local v4 SQLite data, local backups, offline behavior, and signing identity.
- Align the npm manifest, lockfile, Android source version, release guidance, README,
  roadmap, release notes, and this launch guidance with the shipped 1.0 scope.
- Verify upgrade behavior from 0.6.2 and keep the published GitHub wiki accurate before
  release reaches `main`.
- Keep device, performance, and signed-APK verification explicit and pending until the
  supporting evidence exists.

## Non-goals

- No cloud account, network sync, backend, remote storage, or product telemetry.
- No database schema change or change to local-only on-device financial data storage.
- No new chart dependency and no speculative analytics features beyond the shipped
  savings-rate behavior.
- No performance claim or optimization without a same-device, same-build, same-dataset
  before/after measurement.
- No Android device or emulator verification claimed without an actual device pass.

## Constraints

- Android remains the supported platform with minimum API 24.
- Financial data remains in local SQLite at schema v4; money remains integer paise.
- Use the existing release keystore for upgrades. `v0.6.2` is the latest published
  release with versionCode 12; CI derives versionCode 13 for source version 1.0.0.
- Publishing stays on the established `dev` to `main` path. The `main` workflow runs
  tests and typecheck, builds and verifies the signed APK, tags the commit, and publishes
  the GitHub Release. Wiki guidance is reviewed and updated before a release reaches
  `main`.

## Shipped 1.0 behavior

- **Financial analytics:** the savings rate is `null` with zero income (shown as
  "Not available") and negative when expenses exceed income; positive values retain the
  existing percent scale. Amounts remain integer paise. The custom charts state their
  scale, expose exact values as text and in accessibility labels, keep month labels and
  legends, and show explicit empty states; color never carries meaning alone. No chart
  package was added.
- **Backup metadata:** newly exported backups report the running app version from the
  package manifest (`1.0.0`). The backup format, restore validation, V1/V2 compatibility,
  and transactional rollback are unchanged; older backups still restore.
- **Settings and theme:** a dedicated secondary Settings screen holds the existing
  System, Light, and Dark choices plus a concise app-version/about section. Appearance
  controls were removed from Data. Settings has no account or sync controls.
- **Navigation:** Dashboard, Add, History, Budgets, and Data remain the five bottom
  destinations. Analytics, Settings, recurring transactions, financial goals, and
  category management are registered as a native stack above those tabs; their existing
  entry points are preserved and in-app back actions use stack back so Android system
  Back returns to the screen that opened them.
- **UI and accessibility:** shared hierarchy, spacing, and feedback states across the
  primary screens; a theme-derived 48 dp minimum touch-target token; accessible names,
  roles, and states; grouped data-safety actions and labelled budget figures.

## Pending verification (not claimed as complete)

- The Android performance baseline and any measured optimization remain pending: no
  Android device or emulator is available, so no timing or performance claim is made.
- On-device rendered UI, TalkBack, large-text, narrow-width, Settings/theme persistence,
  navigation Back, and analytics/chart flows remain to be exercised.
- A fresh CI quality/debug run on the final integrated code, the signed release APK build
  and its alignment/signature/certificate/versionCode verification, and fresh-install and
  0.6.2-to-1.0.0 upgrade checks remain to be performed.
- GitHub wiki review and updates happen before the release reaches `main`; release
  publication stays with the `main` workflow.

## Approaches

1. **Polish the existing product before 1.0 (selected).** Keep the five tabs and the
   local SQLite model, ship the implemented UI/analytics/Settings/navigation/accessibility
   work, and verify it through the existing release path.
2. **Release the pre-readiness app unchanged.** Rejected: the approved product-readiness
   scope is implemented and is part of the 1.0 candidate.
3. **Add Play Store or connected distribution.** Out of scope: it needs separate setup
   and is not part of the repository's signed-APK release process.

## Release acceptance

- Package and lockfile versions and Android `versionName` are all `1.0.0`; CI derives
  versionCode 13 from the `v0.6.2` tag's code 12.
- The signed APK is tagged `v1.0.0`, uses versionCode 13, and has the same signing
  certificate as 0.6.2.
- Tests and TypeScript checking pass in CI on the final integrated code.
- An upgrade from 0.6.2 preserves transactions, categories, budgets, recurring schedules,
  goals, preferences, and backup behavior, and new backups report 1.0.0.
- README, release guidance, release notes, roadmap, and affected wiki guidance describe
  the shipped 1.0 scope accurately, with cloud sync and accounts out of scope.

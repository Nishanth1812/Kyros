# Kyros 1.0.0 Stable Launch Design

## Intent

Launch the current local-first Kyros app as its first stable major release. Users
get the full feature set already shipped in 0.6.2, with the existing signed APK
distribution, without waiting for a UI redesign or new product features.

## Goals

- Publish `v1.0.0` as a signed Android APK through the existing GitHub Releases workflow.
- Preserve the current v4 SQLite data, local backups, offline behavior, and signing identity.
- Align the npm manifest, lockfile, Android source version, release guidance, README, and roadmap.
- Verify upgrade behavior from 0.6.2 and keep the published GitHub wiki accurate after release.

## Non-goals

- No cloud account, network sync, backend, or Play Store submission.
- No changes to app behavior or database schema.
- No analytics redesign, broad UI changes, dedicated settings screen, or performance project.

## Constraints

- Android remains the supported platform with minimum API 24.
- Financial data remains in local SQLite; money remains integer paise.
- Use the existing release keystore for upgrades.
- `v0.6.2` is the latest published release and has versionCode 12. The existing release workflow will assign versionCode 13 to source version 1.0.0.
- Publishing stays on the established `dev` to `main` path. The `main` workflow runs tests and typecheck, builds and verifies the signed APK, tags the commit, and publishes the GitHub Release.

## Approaches

1. **Release the existing app as 1.0.0.** Keep the change to release metadata, user guidance, and release verification. This matches the request to defer product improvements and uses the pipeline already in place. **Selected.**
2. **Finish a UI and analytics overhaul before 1.0.** This delays launch and pulls deferred work into the release.
3. **Add Play Store distribution.** This requires a separate publishing setup and is outside the repository's signed-APK release process.

## Release acceptance

- Package and lockfile versions and Android `versionName` are all `1.0.0`.
- The signed APK is tagged `v1.0.0`, uses versionCode 13, and has the same signing certificate as 0.6.2.
- Tests and TypeScript checking pass in CI.
- An upgrade from 0.6.2 preserves transactions, categories, budgets, recurring schedules, goals, preferences, and backup behavior.
- README, release guidance, release notes, roadmap, and affected published wiki guidance describe the shipped app accurately.

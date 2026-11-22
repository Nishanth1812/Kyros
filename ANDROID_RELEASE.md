# Android Release Guidance — Kyros 0.2

This document describes how to produce a **signed** release build of Kyros 0.2 and
how to install and upgrade it. Kyros uses React Native and the Android Gradle
wrapper in `android/`. GitHub Actions builds and verifies signed APKs on pushes
to `main` (§9).

Related: [README.md](README.md) (development setup and product details).

## 0. How the project is actually built

- `android/app/build.gradle` defines the package (`com.kyros.app`), base Android
  version, and signing configuration.
- `npm run android` uses the React Native CLI. It builds a **debug** variant, signed
  with the standard template key in `android/app/debug.keystore` (alias
  `androiddebugkey`, passwords `android`). That key is unchanged and continues
  to work; it is never used for release builds.
- A **release** build is a native Gradle build run from `android/`, in PowerShell:

  ```powershell
  cd android
  .\gradlew.bat :app:assembleRelease
  ```

## 1. Signing key (once, before any release build)

Release builds must use a dedicated, long-lived keystore stored **outside** the
repository. Generate one with the JDK `keytool` (on this machine it is available
as `C:\Program Files\Java\jdk-21\bin\keytool.exe`; it is not on `PATH`):

```powershell
$keytool = 'C:\Program Files\Java\jdk-21\bin\keytool.exe'
$keystore = "$HOME\keystores\kyros-release.keystore"

New-Item -ItemType Directory -Force (Split-Path $keystore) | Out-Null
& $keytool -genkeypair -v `
  -keystore $keystore -alias kyros `
  -keyalg RSA -keysize 2048 -sigalg SHA256withRSA `
  -dname "CN=Kyros, OU=Personal, O=Kyros, L=<city>, S=<state>, C=<country>" `
  -validity 3650
```

- Enter a strong, random store password and key password at the prompts; do not
  put them on the command line. Use a long validity: every future upgrade must
  be signed by this same key.
- Back up the keystore and store the passwords in a password manager. Losing the
  keystore means no future build can upgrade an installed release (see §6).
- Record the fingerprint now; it is how you prove a later APK used the same key:

  ```powershell
  & $keytool -list -v -keystore $keystore
  ```

  Note the `SHA256` fingerprint (and the validity dates).

`.gitignore` ignores `*.keystore` (and `*.jks`, `*.key`, etc.) with one explicit
exception for the standard `android/app/debug.keystore`. Keep the release
keystore outside the repo anyway; ignoring a file is not a substitute for good
storage.

## 2. Supply the credentials externally

`android/app/build.gradle` reads four values. Each can be supplied either as a
**Gradle property** (`-P<NAME>=<value>` or a private `~/.gradle/gradle.properties`)
or as an **environment variable** of the same name. If both are set, the Gradle
property wins.

| Name | Meaning |
| --- | --- |
| `KYROS_RELEASE_STORE_FILE` | Path to the keystore. Absolute path recommended; relative paths resolve from the repository root. |
| `KYROS_RELEASE_STORE_PASSWORD` | Keystore password. |
| `KYROS_RELEASE_KEY_ALIAS` | Key alias, e.g. `kyros`. |
| `KYROS_RELEASE_KEY_PASSWORD` | Key password. |

**Never** put these in `android/gradle.properties` or any committed file.
Prefer environment variables for the passwords so they are not stored in
shell history or a properties file:

```powershell
$env:KYROS_RELEASE_STORE_FILE = "$HOME\keystores\kyros-release.keystore"
$env:KYROS_RELEASE_STORE_PASSWORD = '<store password>'
$env:KYROS_RELEASE_KEY_ALIAS = 'kyros'
$env:KYROS_RELEASE_KEY_PASSWORD = '<key password>'
```

These live only in the current PowerShell session. For non-echoed entry use
`Read-Host -AsSecureString` with your own conversion, or an OS secret manager.

Confirm all four are present **without printing the secrets**:

```powershell
@('KYROS_RELEASE_STORE_FILE','KYROS_RELEASE_STORE_PASSWORD',
  'KYROS_RELEASE_KEY_ALIAS','KYROS_RELEASE_KEY_PASSWORD') |
  ForEach-Object { '{0} = {1}' -f $_, [bool][Environment]::GetEnvironmentVariable($_) }
Test-Path $env:KYROS_RELEASE_STORE_FILE   # must be True
```

## 3. Version every release

CI computes the release version and `versionCode` for each new release from
`main` (§9). To change the source version, update `package.json` and
`android/app/build.gradle` together. Keep Android API 24 as the minimum. The
0.2 source base is version `0.2.0` with base `versionCode` 4, above the latest
published tag's annotated code (v0.1.2 / code 3). CI assigns code 5 to v0.2.0.

## 4. Build the release APK

From the repository root, in PowerShell:

```powershell
cd android
.\gradlew.bat :app:assembleRelease
```

Behaviour:

- **All four values present and the keystore file exists** → the `release`
  build type uses `signingConfigs.release` with your keystore.
- **Anything missing, or the keystore path not found** → Gradle stops with an
  explicit `Release build refused: ...` error naming the missing credential(s)
  or the unresolved keystore path. It does **not** fall back to the debug key
  and does not silently emit an unsigned APK.
- **Debug builds are unaffected**: `npm run android` works with no release
  credentials configured.

Only after a successful build does the artifact appear at (relative to the
repository root):

```
android\app\build\outputs\apk\release\app-release.apk
```

## 5. Verify the built APK

Run these only after you have a real APK. Adjust the build-tools version to one
you actually have installed (do not assume a particular version):

```powershell
$apk = 'android\app\build\outputs\apk\release\app-release.apk'
Test-Path $apk   # must be True

$buildTools = Get-ChildItem "$env:ANDROID_HOME\build-tools" |
  Sort-Object Name -Descending | Select-Object -First 1
& "$($buildTools.FullName)\zipalign.exe" -c -v 4 $apk              # exit 0 = aligned
& "$($buildTools.FullName)\apksigner.bat" verify --verbose --print-certs $apk  # exit 0 = valid signature
```

The `apksigner` output includes the signer's `SHA-256` certificate digest.
Compare it with the fingerprint recorded in §1 — they must match, otherwise the
APK was signed by a different key. Gradle/AGP already aligns and signs the APK;
if you ever sign manually, align **before** signing, because changing the file
after signing invalidates the signature.

Optional negative check (useful to prove the guard works): clear the four
release variables in the current session and run the release task again; it must
fail with the explicit refusal message:

```powershell
Get-ChildItem Env:KYROS_RELEASE_* | Remove-Item
.\gradlew.bat :app:assembleRelease   # expect: "Release build refused: ..."
```

## 6. Install and upgrade

- Transfer the APK to a device and install it, e.g.
  `adb install -r android\app\build\outputs\apk\release\app-release.apk` with USB
  debugging enabled.
- Android 12+ (API 31+): grant per-app permission in Settings → Privacy →
  Install unknown apps → choose the installer → Allow from this source.
- **Same key is mandatory.** PackageManager only applies an update when the new
  APK is signed with the same key as the installed one. Reuse the §1 keystore
  for every release.
- **Upgrade test:** install a 0.1.x release, add income and expense entries, then
  install the 0.2.0 release signed with the same key; reopen the app and confirm
  the SQLite entries are still present, ordered, and assigned to the matching
  type's `Other` category by the v1-to-v2 migration (§7). Recategorize an entry,
  add a custom category, edit and delete entries, and check filters and dashboard
  totals against those same values.
- **Debug vs release:** the debug key cannot overwrite a release-signed install
  (or vice versa). Test upgrades only with release-signed APKs.
- **If the keystore is lost:** you cannot sign an APK that upgrades the existing
  install. Recovery is uninstall/reinstall, which deletes the SQLite data in all
  local releases so far — there is no backup/restore yet.

## 7. Database compatibility

Android opens the existing `files/SQLite/kyros.sqlite` database in place. Kyros
0.2 migrates it from schema v1 to v2 in one transaction: it creates and seeds
`categories`, adds a required `category_id` to transactions (mapping existing
rows to the matching type's `Other`), and only then sets `user_version` to 2.
If any step fails, the original table, rows, and version are left intact. Include
income and expense entries created by the previous app in the upgrade check (§6).

## 8. Security summary

- No keystore, key or password is committed; `.gitignore` covers keystore file
  extensions while keeping the standard debug key functional.
- Release signing credentials come only from Gradle properties or environment
  variables supplied externally at build time.
- Missing credentials cause a clear, early failure rather than a debug-signed
  or unsigned release artifact.

## 9. Automated checks and signed APK releases (CI)

The single push-only GitHub Actions workflow handles checks and signed APK releases:

- **Checks on pushes to `dev` or `main` only.** Tests and typecheck run once.
  On `dev`, the workflow then builds an Android debug APK without release
  secrets for `arm64-v8a` phones and `x86_64` emulators and uploads it for
  pre-release feature testing. On `main`, it instead builds a signed release
  APK with all four configured Android ABIs after the quality checks pass.
- **Signed APK on push to `main`.** A push to `main`, including a merge from
  `dev`, builds the release from `android/`, verifies it (§5), and publishes a
  versioned APK on GitHub Releases. The same APK is also available as a GitHub
  Actions artifact for 30 days. Pushes to `dev` do not produce release APKs.
- **Release notes.** Add `release-notes/vX.Y.Z.md` before merging the release
  into `main`. If that file is absent, GitHub generates notes from the changes.
- **Wiki.** For each main release, review the [wiki](https://github.com/Nishanth1812/Kyros/wiki)
  against the released changes. Update affected usage, setup, data, and release
  guidance as needed, then verify the published pages. Release notes do not
  replace updating existing guidance.

**Secrets.** The keystore and passwords are never committed. In CI they live as
encrypted GitHub Actions repository secrets, exposed only to the `main` release
job. That job decodes the keystore into a
temporary file and supplies the other values as environment variables. Do not
pass them as `-P`/command-line arguments and do not print them: GitHub masks
registered secret values in logs, but a value reconstructed or echoed by a script
is not. Protect the secrets with repository access controls and back up the
keystore and passwords outside GitHub (§1)—losing them blocks future signed
upgrades. Configure these repository secrets before triggering the workflow:

| Purpose | GitHub Actions secret |
| --- | --- |
| Keystore (base64-encoded) | `KYROS_RELEASE_KEYSTORE_BASE64` |
| Store password | `KYROS_RELEASE_STORE_PASSWORD` |
| Key alias | `KYROS_RELEASE_KEY_ALIAS` |
| Key password | `KYROS_RELEASE_KEY_PASSWORD` |

**Debug vs release.** Debug builds (`npm run android`) use the template key and
need none of these secrets; release builds require all four values and refuse to
build if any is missing (§4). A debug build cannot upgrade a release install (§6).

**Versioning.** The source versions in `package.json` and
`android/app/build.gradle` must match. Gradle defines the base `versionCode`. After
the signed APK passes alignment and certificate verification, CI creates an
annotated `vX.Y.Z` tag on the `main` commit and records the APK's versionCode in
the tag message. Each later release on the same minor line increments the latest
tagged patch and versionCode by one. The first release of a new minor line uses
that line's exact source version: advancing from the 0.1.x line to source `0.2.0`
produces `v0.2.0` (not `0.2.1`); the earlier 0.1.0 source produced `v0.1.1`/code 2.
Rerunning the same main commit reuses its tag and version. A failed build or
signature check creates no tag, so it does not consume a version. The workflow
does not change the repository's source version files. Keep release tags and the
same signing key for every release; back up the key (§1, §6).

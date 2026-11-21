# Android Release Guidance — Kyros 0.1

This document describes how to produce a **signed** release build of Kyros 0.1 and
how to install and upgrade it. It is written for the repository's **actual**
workflow: an Expo SDK 58 app whose native Android project lives in `android/` and
is built with the Android Gradle wrapper from that folder. Automated checks and
the signed-APK release workflow are covered in §9.

**Scope of this work:** the Gradle configuration below was changed so release
builds no longer use the debug key. **No APK has been built or verified here.**
An APK exists only after you run a successful build on a machine that has the
Android SDK and the external release keystore. Do not assume any artifact path
listed below is populated until you have produced it yourself.

Related: [README.md](README.md) (dev setup and product decisions),
[release-0.1.md](release-0.1.md) (release goal and checks), [plan.md](plan.md).

## 0. How the project is actually built

- `app.json` is the source of truth for `expo.version`, `expo.android.versionCode`
  and `expo.android.package` (`com.kyros.app`).
- `npx expo prebuild --platform android` generates/refreshes `android/` from
  `app.json` plus the configured Expo plugins. It **overwrites template-managed
  native files, including `android/app/build.gradle`** — so it also overwrites
  the release signing configuration described here. Re-apply it after any
  prebuild (see §7), or avoid re-prebuilding once signing is in place.
- `npm run android` is `expo run:android`. It builds a **debug** variant, signed
  with the standard template key in `android/app/debug.keystore` (alias
  `androiddebugkey`, passwords `android`). That key is unchanged and continues
  to work; it is never used for release builds.
- A **release** build is a native Gradle build run from `android/`, in PowerShell:

  ```powershell
  cd android
  .\gradlew.bat :app:assembleRelease
  ```

There is no Gradle wrapper at the repository root, and Expo EAS is not used in
this project.

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

**Never** put these in `android/gradle.properties`, `app.json`, or any committed
file. Prefer environment variables for the passwords so they are not stored in
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

1. In `app.json`, set `expo.version` (e.g. `0.1.1`) and increment
   `expo.android.versionCode` (integer, +1 each release).
2. Run `npx expo prebuild --platform android` so those values reach
   `android/app/build.gradle` (`versionCode` / `versionName`).
3. Re-apply the release signing configuration after the prebuild (§7).
4. Keep the supported Android range constant (API 24 minimum per `README.md`).

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

This file is **not** present in the repository as part of this configuration
work. Treat it as existing only once you have built it.

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

Optional negative check (useful to prove the guard works): clear the five
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
- **Upgrade test (per `release-0.1.md`):** install release 1, add income and
  expense entries, then install a newer release signed with the same key;
  reopen the app and confirm the SQLite entries are still present and ordered.
- **Debug vs release:** the debug key cannot overwrite a release-signed install
  (or vice versa). Test upgrades only with release-signed APKs.
- **If the keystore is lost:** you cannot sign an APK that upgrades the existing
  install. Recovery is uninstall/reinstall, which deletes the SQLite data in
  0.1 — there is no backup/restore yet.

## 7. After re-running `expo prebuild`

Prebuild regenerates `android/app/build.gradle`, so the release signing setup
must be restored. It consists of four parts:

1. The credential resolution block (`releaseSigningKeys`, `releaseSigning`,
   `missingReleaseSigningKeys`, `releaseKeystoreFile`, `releaseSigningReady`)
   near the top of `android/app/build.gradle`.
2. A `release { ... }` entry inside `signingConfigs` using those values; the
   existing `debug { ... }` entry stays as-is.
3. `signingConfig signingConfigs.release` inside `buildTypes.release`, guarded
   by `if (releaseSigningReady)`.
4. The `gradle.taskGraph.whenReady { ... }` guard that throws a
   `GradleException` when a release task runs without a complete configuration.

The current `android/app/build.gradle` contains all four and is the canonical
example. Re-run the checks in §2 and §5 after restoring them.

## 8. Security summary

- No keystore, key or password is committed; `.gitignore` covers keystore file
  extensions while keeping the standard debug key functional.
- Release signing credentials come only from Gradle properties or environment
  variables supplied externally at build time.
- Missing credentials cause a clear, early failure rather than a debug-signed
  or unsigned release artifact.
- No APK is claimed, committed, or verified by this documentation change.

## 9. Automated checks and signed APK releases (CI)

The single push-only GitHub Actions workflow handles checks and signed APK releases:

- **Checks on pushes to `dev` or `main` only.** Tests and typecheck run once.
  On `dev`, the workflow then builds an Android debug APK without release
  secrets for `arm64-v8a` phones and `x86_64` emulators and uploads it for
  pre-release feature testing. On `main`, it instead builds a signed release
  APK with all four configured Android ABIs after the quality checks pass.
- **Signed APK on push to `main`.** A push to `main`, including a merge from
  `dev`, builds the release from `android/`, verifies it (§5), and uploads the
  APK as a GitHub Actions artifact. Pushes to `dev` do not produce release APKs.

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
| Keystore (base64-encoded) | `RELEASE_KEYSTORE_BASE64` |
| Store password | `RELEASE_STORE_PASSWORD` |
| Key alias | `KYROS_RELEASE_KEY_ALIAS` |
| Key password | `RELEASE_KEY_PASSWORD` |

**Debug vs release.** Debug builds (`npm run android`) use the template key and
need none of these secrets; release builds require all four values and refuse to
build if any is missing (§4). A debug build cannot upgrade a release install (§6).

**Versioning.** The source versions in `package.json`, `app.json`, and
`android/app/build.gradle` must match, as must both Android version codes. After
the signed APK passes alignment and certificate verification, CI creates an
annotated `vX.Y.Z` tag on the `main` commit and records the APK's versionCode in
the tag message. Each later main release increments the latest tagged patch and
versionCode by one. The first release from 0.1.0/version code 1 is 0.1.1/code 2.
Rerunning the same main commit reuses its tag and version. A failed build or
signature check creates no tag, so it does not consume a version. The workflow
does not change the repository's source version files. Keep release tags and the
same signing key for every release; back up the key (§1, §6).

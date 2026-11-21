# Kyros 0.1 release plan

## Release goal

Deliver an attractive, usable Android APK that records income and expenses locally and displays them after the app is reopened, including without an internet connection.

## Scope

1. **App foundation:** Set up React Native for Android, navigation, a consistent visual style, and accessible text and controls.
2. **Add transactions:** Provide a form for income or expense, amount, date, and an optional description. Validate required fields and show clear errors; never save an invalid amount.
3. **View transactions:** Show saved entries newest first, with their type, amount, date, and description. Include a useful empty state and a clear path to add an entry.
4. **Local storage:** Persist transactions in SQLite. Store amounts as integer minor units rather than floating-point values, and preserve data across app restarts and upgrades.
5. **Android release:** Build a versioned, signed APK and document installation and future signing-key storage so updates can be installed over earlier releases.

## Build order

1. Establish the Android project, navigation, visual style, and a runnable development build.
2. Add the SQLite schema and transaction persistence, with checks for valid amounts and successful reopening.
3. Build the transaction form and list, including loading, empty, and error states.
4. Test the complete offline flow on Android, then produce and install the release APK.

## Release checks

- Add both income and expense entries; confirm their details and order in the list.
- Reject empty, zero, negative, malformed, and excessively large amounts without saving them.
- Close and reopen the app and confirm saved entries remain intact; repeat offline.
- Verify accessible labels, readable contrast, and usable layouts on different Android screen sizes and text scales.
- Install the signed APK, create data, and verify a subsequent build signed with the same key preserves it.

## Decisions and boundaries

- Choose the initial supported currency and Android version range before implementation; 0.1 uses one currency and does not convert currencies.
- Editing, deletion, categories, dashboards, budgets, and backup are planned for later releases. Entries cannot be corrected or recovered through the app in 0.1, so it is an early release rather than a sole place to keep important records.
- Accounts, APIs, cloud sync, hosting, and the cloud database are deferred; no backend is required for 0.1.

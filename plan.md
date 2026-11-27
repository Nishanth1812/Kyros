# Kyros product and release roadmap

## Product goal

Build a polished Android app for tracking personal finances and spending, with a
cohesive experience for recording transactions, understanding spending, and
planning ahead. Distribute releases as signed APKs.

This file is the product roadmap and the starting point for future release
planning. It describes user outcomes, release boundaries, dependencies, and
release checks. Before implementation begins for a release, write a separate
detailed plan with the exact screens, data changes, migration behavior, and
tests for that release.

## Product principles and constraints

- Keep the app useful without an account, network connection, or backend through
  the local-first releases.
- Keep financial data on the device unless a later connected release is chosen.
- Store money as integer minor units and preserve accurate calculations.
- Preserve existing transaction data through every schema change, app upgrade,
  and restore flow. Removing a category must never remove its transactions.
- Keep releases usable as a whole; do not make a future feature a prerequisite
  for recording and reviewing transactions.
- Keep the early release scope flexible in response to use and feedback.
- Keep Android as the supported platform unless a later plan changes that scope.
- When connected features add HTTP APIs, use unversioned route paths and evolve
  those APIs compatibly. App release versions remain separate from API routes.

## Release roadmap

### 0.1 — Local transaction foundation (released)

**Goal:** Record income and expenses on Android and find them again after
restarting the app, including offline.

**Delivered:** React Native Android app, Add and History tabs, transaction form,
local SQLite storage, INR amounts stored in paise, newest-first history, and a
signed APK release process.

### 0.2 — Transaction management and spending overview

**Goal:** Let people organize, correct, and review transactions, then understand
their current balance and spending from the same local data.

**Scope:**

- Add built-in income and expense categories and let users create custom
  categories. Select a category when creating or editing a transaction.
- Edit and delete transactions. Make deletion clear and deliberate; keep
  transaction values and category references valid after edits.
- Filter transaction history by transaction type, category, and date range.
- Add a dashboard with a balance and spending summaries. Derive every total
  from the saved transactions rather than maintaining a second balance value.
- Migrate existing 0.1 databases so every saved transaction remains available
  and can be assigned a category.

**Release checks:** Upgrade a database containing 0.1 income and expense entries
without losing or changing their amounts; create, edit, and delete transactions;
create and select a custom category; verify filters against known entries; and
check dashboard totals against those same entries. Confirm the app still works
offline and on a fresh install.

**Details for the 0.2 implementation plan:** Specify the built-in category set
and dashboard balance scope and summary periods. Custom category rename/removal
is deferred; if added later, preserve all linked transaction history.

### 0.3 — Budgets and progress

**Goal:** Help people compare planned spending with actual spending over time.

**Scope:**

- Let users set spending budgets and see spent and remaining amounts.
- Show clear progress views and useful breakdowns over time, building on 0.2
  categories, filters, and summaries.
- Keep budget calculations based on saved expense transactions and the same
  integer-paise rules used elsewhere.

**Release checks:** Verify progress at the start, within, and beyond a budget;
confirm income is not counted as spending; and compare category and period
totals against the transaction history. Preserve budgets and transactions when
the app is upgraded.

**Details for the 0.3 implementation plan:** Choose the budget period and whether
budgets apply per category, overall, or both. Define period boundaries and
behavior when a category is renamed or removed. Defer alerts and rollover rules
unless user feedback establishes a need.

### 0.4 — Local data safety and quality (implemented)

**Goal:** Make locally stored financial data easier to recover and improve the
app's reliability and accessibility before considering connected services.

**Scope:**

- Add user-controlled local backup and restore for transactions, categories,
  and budgets.
- Validate backup contents before restoring and make any replacement of
  on-device data explicit.
- Improve accessibility and validation across the main transaction, overview,
  budget, and restore flows.
- Expand automated and manual testing for data migrations, recovery, and
  supported Android layouts and text scales.

**Release checks:** Back up representative data, restore it on a clean install,
and compare transaction, category, and budget totals. Reject invalid or
unsupported backup data without partially replacing the current database.
Exercise upgrades from earlier releases and the main accessibility flows.

**Details for the 0.4 implementation plan:** Select a portable backup format and
the Android file selection flow. Document what a restore replaces and how users
can keep a copy of their existing data. No account or cloud backup is required
for this release.

### 0.5 — Enhanced analytics and visuals (implemented)

**Goal:** Provide visual analytics, category distribution charts, multi-month
spending and income trends, historical month reviews, and CSV spreadsheet reports
while preserving the local-first SQLite foundation.

**Scope delivered:**

- Month navigation on Dashboard to review any historical month's earnings,
  spending, and category breakdown, with quick return to current month.
- Proportional visual category distribution bars and percentage breakdowns.
- 6-month historical spending and income trend chart with accessible touch targets.
- Dedicated Financial Analytics screen with daily spending metrics, savings rate,
  and category analysis.
- RFC 4180 CSV transaction export via Storage Access Framework.

### 0.6 — Feature expansion and sync readiness (released through 0.6.2)

**Goal:** Expand local financial power with safe category management, recurring
transaction schedules, savings goals with progress tracking, dynamic theme
customization, enhanced history search and tagging, and a synchronizable delta
engine that lays the offline-first cloud sync foundation.

**Scope:**

- Category management: safe category rename, archival, and deletion with mandatory
  transaction reassignment so no transactions are ever orphaned.
- Recurring transaction engine: daily, weekly, monthly, and yearly recurring
  templates with next-due-date calculation and 1-tap review and apply on Dashboard.
- Financial goals tracker: savings targets with deadlines, contributions,
  completion status, and visual progress bars; 80% warning indicators on monthly
  budgets.
- Appearance & customization: system, dark, and light theme modes with WCAG AAA
  compliant high-contrast palettes; real-time history search and `#tag` filtering.
- Sync readiness: SQLite schema v4 with `updated_at`, `is_archived`, and
  `deleted_tombstones`; export and apply local deltas with last-write-wins
  conflict handling. No network transport or cloud account is included.
- Backup V2: export category state, budgets, transactions, recurring schedules,
  goals, and tombstones; restore V1 and V2 backups atomically.

**Release checks:** Verify v3-to-v4 schema migration preserves all existing data;
verify category deletion reassigns linked transactions and recurring schedules
atomically; verify recurring dates and exact paise amounts; verify goal
contributions and concurrent updates; test system/light/dark themes across screens;
restore V1 and V2 backups; and confirm local deltas preserve newer edits and apply
tombstones without data loss.

### 1.0 — Stable local-first launch

**Goal:** Launch the existing Kyros experience as its first stable major release
without changing local-first behavior or adding launch-blocking feature work.

**Scope:**

- Ship the existing 0.6.2 feature set as Kyros 1.0.0.
- Keep Android as the supported platform and publish a signed APK through the
  existing GitHub Releases workflow.
- Preserve the v4 SQLite database, local backups, integer-paise calculations,
  offline operation, and the existing signing key.
- Keep accounts, network services, multi-device sync, and the proposed UI,
  analytics, settings, and performance improvements out of 1.0; evaluate them
  for later releases.

**Release checks:** Run the automated tests and TypeScript check; install the
1.0.0 APK over 0.6.2 data signed with the existing key; verify all existing data
and settings survive; verify the APK signature and versionCode 13; and review
and update the published GitHub wiki after release.

### 1.1 and later — Future product improvements

**Candidate work:** Improve analytics visuals, refine the overall interface,
provide dedicated settings, and measure and address performance bottlenecks.
Reconsider multi-device synchronization only when a concrete user need and its
privacy and account requirements are known. These are future candidates, not
commitments for the 1.0 release.

#### Connected services and multi-device sync (unscheduled)

**Goal:** Enable secure multi-device synchronization over cloud backends built
on top of 0.6's delta engine, while retaining 100% offline-first local
capability.

**API compatibility:** Do not add version prefixes to API routes. Evolve the
API compatibly and plan migrations for changes that cannot be made additively.

**Entry condition:** Start detailed planning when feedback or a concrete use case
shows that users need multi-device access or another connected capability. Do
not select hosting or a cloud database before the requirements are known.

**Release checks:** Prove that existing local data can be migrated without loss,
that repeated synchronization does not duplicate or silently overwrite data,
and that core transaction flows still work offline. Define security, account
recovery, privacy, and service-operation checks before implementation.

**Details for a future plan:** Compare backend hosting (including Vercel or AWS)
and cloud databases (including Neon, AWS Postgres, or Supabase) against the
actual scale, security, availability, and cost requirements. Treat the SQLite
migration and a recoverable account lifecycle as prerequisites to enabling
sync.

## Release delivery checklist

For each release to `main`:

1. Complete that release's feature checks and verify upgrade behavior from the
   previous signed APK with existing data.
2. Run the repository's automated tests and TypeScript check, and produce and
   verify the signed Android APK using the existing release key.
3. Add release notes for the shipped behavior and version.
4. Review the GitHub wiki against the release, update affected user guidance,
   setup, data, or release instructions, and verify the published pages.

See `ANDROID_RELEASE.md` for signing, versioning, APK verification, and install
guidance.

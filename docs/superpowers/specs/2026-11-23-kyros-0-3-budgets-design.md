# Kyros 0.3 Budgets and Progress Design

## Intent

Kyros 0.3 helps people compare planned spending with actual spending, using the transaction and category data already stored on the device. A user can set one overall monthly expense limit and monthly limits for individual expense categories, then see how much has been spent and how much remains.

## Goals

- Support an optional overall monthly budget and optional per-category monthly budgets at the same time.
- Show current-month spending and remaining amounts for both scopes, including when spending exceeds a budget.
- Keep calculations derived from saved expense transactions and integer paise.
- Preserve transactions, categories, and saved budget data through app upgrades.
- Keep the app useful offline and avoid adding a backend or dependency.

## Non-goals

- Income budgets, custom budget periods, alerts, rollover, cloud sync, and multi-currency support.
- Category rename or removal; neither operation exists in 0.2.
- Historical month navigation or month-specific limit changes. A saved limit is a recurring monthly target and progress resets with the device's local calendar month.

## Constraints and invariants

- Android remains the supported platform, minimum Android 7.0 (API 24).
- SQLite remains the source of truth. Advance the schema from v2 to v3 with a transactional migration that leaves existing transaction and category rows unchanged and rolls back fully on failure.
- Store budget amounts as positive, safe integer paise. Reject invalid amounts at the input/storage boundary; do not round financial totals.
- Only expense categories can have category budgets. Associate a category budget with its category ID so its ownership is unambiguous.
- Allow at most one overall budget and one budget per expense category. Deleting or changing a budget never changes transactions or categories.
- Calculate actuals over the current local-calendar month, using the same date-boundary rules as the dashboard. Income never contributes to spending.
- The same saved monthly limits apply each calendar month; progress resets at month boundaries. There is no rollover or notification behavior.
- Do not add dependencies. Reuse the current storage, state, navigation, formatting, and React Native patterns.
- Before a release reaches `main`, add versioned release notes and align user-facing setup/data guidance. After the release, review, update, and verify affected published GitHub wiki pages.

## Approaches

1. **Recurring monthly limits (recommended):** save one overall limit and category limits, apply them to each local calendar month, and derive progress from that month's expenses. This matches the existing current-month dashboard and keeps period selection, copies, and rollover out of the first budgets release.
2. **Separate limits for each selected month:** store a month with every limit and add month navigation and historical editing. This supports changing a plan month by month but adds period management and more UI than the initial roadmap requires.
3. **Flexible periods with rollover:** let users configure periods and carry unused amounts forward. This adds configuration and edge cases; the roadmap explicitly defers alerts and rollover until feedback justifies them.

The user selected option 1: saved limits recur each month and progress is shown for the current local-calendar month only. The user also selected both overall and per-category budgets and a dedicated Budgets tab.

## Proposed experience

Add a dedicated Budgets destination using the existing bottom-tab and screen patterns. It lets users set, edit, and remove the overall limit and expense-category limits. The screen shows current-month spent, remaining, and over-budget amounts for the overall limit and each configured category limit. Display spent and remaining values accurately; a visual progress indicator may cap at full while the numeric overage remains visible. The existing dashboard remains focused on its current balance and spending summaries.

If no budget exists for a scope, show a clear setup action. With no matching expenses, show zero spent and the full amount remaining. A missing overall budget does not hide configured category budgets, and vice versa.

## Delivery slices

1. **Persist budgets safely:** schema v2-to-v3 migration, budget types, validation, SQLite storage, uniqueness and foreign-key constraints, and storage/migration tests.
2. **Manage budgets:** load budgets through the existing transaction context and add accessible create/edit/delete flows for the overall monthly limit and expense-category limits.
3. **Show progress:** calculate current-month expense actuals and present overall and per-category progress, including empty and over-budget states.
4. **Prepare release:** automated checks, Android build and upgrade verification, version alignment, user-facing release notes and repository guidance.
5. **Verify published wiki:** after the release reaches `main`, update affected usage/data/release pages and verify the published pages. This work has no repository code PR because the wiki is a separate published surface.

Each code slice should have its own branch commit(s), PR into `dev`, and issue closed after that PR merges. The published-wiki issue closes after verification following the `main` release.

## Release acceptance

- A clean install creates a working v3 database; a v2 database migrates transactionally and keeps all transactions and categories intact.
- Overall and per-category budgets validate and persist independently; invalid or duplicate budgets are rejected.
- Progress matches expense history for the current local-calendar month, excludes income, and represents zero spend and overspending correctly.
- Automated tests, TypeScript checks, Android debug build, and a signed-APK upgrade from the previous release succeed.
- Release notes and user-facing setup/data guidance match Kyros 0.3; the affected published wiki pages are reviewed and verified after release.

## Decisions confirmed

- Saved limits recur unchanged each calendar month; progress is shown for the current local-calendar month only.
- Budget management and progress use a dedicated Budgets tab.
- Delivery uses dependency-first issue slices, with a PR to `dev` after each code issue is complete.

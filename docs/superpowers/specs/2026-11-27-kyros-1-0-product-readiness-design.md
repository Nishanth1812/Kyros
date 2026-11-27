# Kyros 1.0 Product Readiness Design

**Status:** Draft for owner review

**Scope:** UI, financial analytics, Settings, performance, and backup metadata before the 1.0 release.

## Intent

Kyros should let people record transactions quickly and understand their monthly spending without making them hunt for key controls. The app remains a private, local-first finance tracker; 1.0 improves the clarity, accessibility, and responsiveness of the existing product before release.

## Current state

- The five primary tabs are Dashboard, Add, History, Budgets, and Data.
- Analytics is opened as a modal from Dashboard. Recurring transactions, goals, and category management use separate modal or in-screen flows, so secondary navigation and Android Back behavior are inconsistent.
- Analytics already derives monthly income, expense, net balance, daily average, savings rate, top category, six-month trends, and category breakdowns from local transactions. The custom chart components include accessibility labels and legends.
- Appearance controls are on the Data screen alongside categories, backup, restore, and CSV export. There is no dedicated Settings screen.
- History already uses a `FlatList`; it is not a known list-virtualization gap.
- Analytics recomputes both monthly metrics and trends on every render. Other possible performance hot spots have not been measured, and there is no performance benchmark.
- JSON backup metadata defaults to app version `0.6.0`, even though the 1.0 release candidate is version `1.0.0`.
- The current release-only 1.0 plan explicitly defers these product improvements. It must be revised after this design is approved.

## Goals

1. Give Dashboard, Add, History, Budgets, Data, and Analytics a coherent visual hierarchy using the existing theme, typography, spacing, and layout helpers.
2. Make existing financial insights easier to compare and interpret. Improve chart scale/context, labels, legends, empty states, and screen-reader descriptions without adding a chart dependency or unrelated metrics.
3. Add a dedicated Settings screen for the existing appearance choices. Keep the five primary tabs and keep backups, restore, CSV export, and category management in the Data area.
4. Make secondary navigation consistent and honor Android system Back. Preserve existing entry points for Analytics, Recurring, Goals, and Category Management.
5. Measure performance on Android before and after any optimization. Fix only bottlenecks demonstrated by those measurements.
6. Make newly exported backups report the running app version without changing the backup schema or rejecting backups from older versions.
7. Replace the current tautological accessibility check with checks that validate app-owned accessibility requirements.

## Non-goals

- No accounts, cloud sync, backend, remote storage, or product telemetry.
- No database schema change, change to local-only financial data storage, or loss of existing records.
- No new charting package or speculative analytics features.
- No redesign of the product's financial model beyond the approved savings-rate edge-case behavior below.
- No change to the supported Android minimum (API 24) or addition of another supported platform.

## Approaches considered

### 1. Polish the existing product (selected)

Keep the five tabs, refresh the existing screens and charts, move Appearance to a Settings destination, give secondary screens consistent back behavior, and profile before optimizing. Retain the current local SQLite data model and financial feature set. This addresses the requested experience while keeping data and release risk low.

### 2. Replace the Data tab with Settings

Make Settings a primary tab and nest data-safety tools beneath it. This makes Settings prominent but adds navigation steps to backup and restore and displaces a current primary destination.

### 3. Add new financial analytics first

Introduce more metrics and comparisons before refreshing navigation and the rest of the screens. This expands the financial product surface and risks making the current information hierarchy harder to use.

Approach 1 is selected because it improves the existing experience without growing the number of primary destinations or adding cloud/data-model risk.

## Product and interaction design

### Navigation

- Keep Dashboard, Add, History, Budgets, and Data as the five bottom destinations.
- Add Settings as a secondary destination reachable from a consistent app-bar control on primary screens.
- Use the project's existing React Navigation capabilities to represent secondary screens as routes. Preserve current entry points to Analytics, Recurring, Goals, and Category Management, and ensure Android system Back returns to the screen that opened them.
- Reuse installed navigation dependencies. Add a dependency only if the existing packages cannot provide the route behavior cleanly.

### Screen hierarchy

- **Dashboard:** lead with the current balance and selected-month income/expense; make the next action and Analytics entry easy to find.
- **Add:** prioritize amount, transaction type, category, and date; retain existing validation and unsaved form values on errors.
- **History:** preserve search, filters, editing, deletion, and `FlatList` virtualization; improve the visual hierarchy and empty/filter states.
- **Budgets:** make limit, amount used, and remaining amount easy to distinguish without changing budget calculations.
- **Data:** keep backup, restore, CSV export, and category management together; remove Appearance controls from this screen.
- **Analytics:** keep the existing metric set and selected-month behavior. Improve comparisons and make chart scale and meaning clear in both light and dark themes. Do not make color the only way to distinguish series or categories.
- **Settings:** initially contain the existing System, Light, and Dark appearance choices plus a concise app-version/about section. Do not add account or sync controls.

Use the current design tokens and shared UI components where they fit. Keep interactive targets at least 48 dp, support large text and narrow screens, and retain accessible names and state for controls and chart data.

### Financial analytics behavior

All amounts remain integer paise and calculations remain local. Tests and explanatory labels must cover zero activity, missing category names, income of zero, and expenses greater than income.

The current savings-rate calculation reports `0%` whenever expenses exceed income. The approved behavior is `(income - expenses) / income * 100`, allowing a negative rate when spending exceeds income and showing “Not available” when there is no income. The negative rate distinguishes a deficit from break-even. Add coverage for positive, negative, and unavailable cases.

### Performance

Use React Native's profiling guidance and compare the same Android device, build type, and dataset before and after changes. Record the tested device and dataset. Cover cold launch, Dashboard entry, Analytics calculations/render, and History search/filter with representative and stress-sized transaction sets.

There is no measured regression today. Do not add memoization, incremental context updates, or list tuning solely because a pattern looks potentially expensive. If profiling identifies a user-visible bottleneck, make the smallest fix at its owner and report the before/after result. If no Android device is available, keep runtime performance claims explicitly unverified rather than substituting a desktop or unit-test timing.

### Backup metadata

New JSON exports must identify the version of Kyros that created them. Keep the existing backup format and restore compatibility; older backup metadata remains accepted. Derive the exported version from the app's authoritative version source rather than adding another independent version literal.

## Constraints

- React Native 0.88, TypeScript, Android API 24 minimum, and the current React Navigation setup.
- SQLite remains the source of truth; existing transactions, categories, budgets, goals, recurring records, and backups must remain usable.
- No backend, network dependency, schema migration, or chart dependency.
- Preserve input validation, transactional restore behavior, and cancellation/data-loss safeguards.
- Any 1.0 version and release documentation must remain consistent with the revised product scope.

## Acceptance criteria

1. All existing primary screens have a consistent, legible hierarchy in both themes, including loading, error, and empty states.
2. Settings is reachable from the primary app navigation without taking a bottom-tab slot; choosing a theme persists and system Back returns to the prior screen.
3. Existing analytics remain accurate in integer paise. Chart values and meaning can be understood without relying on color alone; zero and deficit cases are explicit.
4. Secondary screens retain their entry points and system Back behavior returns to the originating screen.
5. Backup exports created by 1.0 identify the 1.0 app version; 0.6.x backups still restore using the existing validation and rollback protections.
6. Accessibility checks exercise rendered app-owned requirements rather than asserting a constant. Interactive targets remain at least 48 dp.
7. Any performance optimization has a same-device, same-dataset before/after measurement and does not regress correctness or data safety.
8. The 1.0 plan and user-facing release guidance describe the shipped scope accurately. Before a release reaches `main`, review and update affected GitHub wiki pages and verify the published guidance.

## Research references

- React Native performance overview: https://reactnative.dev/docs/performance
- React Native list optimization: https://reactnative.dev/docs/optimizing-flatlist-configuration
- Android mobile navigation patterns: https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns
- Android guidance for secondary destinations: https://developer.android.com/design/ui/mobile/guides/foundations/translate-designs
- Data visualization accessibility checklist: https://accessibility.mass.gov/testing-checklists/data-vis/
- USWDS data visualization guidance: https://designsystem.digital.gov/components/data-visualizations/

## Decisions still needed from the owner

- Approve this complete design before implementation begins. A task-by-task implementation plan follows that approval.

# Kyros project plan

## Goal

Build a polished, functional Android app for tracking personal finances and spending with React Native. Distribute each release as an APK.

## Release roadmap

- **0.1 — Foundation:** Set up the app, navigation, visual direction, and local SQLite storage. Add income and expense entries and a transaction list. See [the 0.1 release plan](release-0.1.md).
- **0.2 — Spending overview:** Add categories, transaction editing and deletion, filters, and a dashboard with balances and spending summaries.
- **0.3 — Planning:** Add budgets and clear progress views, with useful breakdowns over time.
- **0.4 — Data and reliability:** Add local backup and restore, validation, accessibility improvements, and broader testing.
- **0.5 and later — Connected features:** Design and implement secure APIs and account-based cloud sync when needed. Choose backend hosting (Vercel or AWS) and a cloud database (such as Neon, AWS Postgres, or Supabase) based on the requirements at that stage. Plan and test migration from SQLite without losing existing data.

## Principles

- Keep the early app usable with local data; do not assume a network connection.
- Protect financial data and use accurate money calculations from the start.
- Deliver a cohesive, accessible Android experience and test each release before distributing its APK.
- Treat release scope as flexible and adjust it based on use and feedback.

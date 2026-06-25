# Protected Contracts

These behaviors are runtime contracts. Do not casually change them.

- Electron owns AtCoder login. Authenticated AtCoder cookies live in the
  Electron session, not in the localhost page or exported backup data.
- The Electron app starts a private `127.0.0.1` server and opens the dashboard in
  the user's browser on launch, reactivation, and menu/tray open actions.
- Localhost API calls require the launch token and same-origin authorization
  checks. Do not weaken this security model.
- Settings and training state are persisted per user. Storage key changes need
  explicit migration planning and tests.
- Account switching must protect existing per-user training history.
- Authenticated submission checks should fall back to public data when
  necessary.
- Public AtCoder/Kenkoooo fallback behavior should remain intact unless the task
  explicitly changes it.
- Quitting the macOS app should stop the localhost server.
- The Discord bot must not store AtCoder passwords or user cookies. It links
  Discord users to AtCoder handles and verifies ACs through public AtCoder pages
  with Kenkoooo fallback.
- Discord bot state is guild-scoped and local to the SQLite file. Do not assume
  cross-server or cross-host history unless a task explicitly adds it.
- Discord leaderboard points must come from verified score events, not mutable
  totals alone.

When a task requires changing one of these contracts, make the change explicit in
the implementation notes, update tests around the changed behavior, and document
any migration or compatibility impact.

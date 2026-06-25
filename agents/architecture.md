# Architecture Direction

The desired direction is extreme modularity with readable, independent parts.
Prefer small modules with clear inputs and outputs over broad files that mix UI,
state, data access, and platform behavior.

Current high-level source areas:

- `src/app/`: web app orchestration, routing, shell injection, and state setup.
- `src/features/`: product features such as problemset, stats, training, and
  progress.
- `src/electron/`: macOS Electron launcher, local server, JSON persistence, and
  desktop data service.
- `src/discord/`: Discord bot commands, local SQLite persistence, guild-scoped
  training state, and bot-specific adapters.
- `src/platform/`: runtime adapters for storage, messaging, and local desktop
  control.
- `src/services/atcoder/`: AtCoder/Kenkoooo data access types, messages, and
  clients.
- `src/background/` and `src/entrypoints/`: compatibility entrypoints and
  browser-extension background behavior.
- `src/shared/`: genuinely cross-cutting utilities.

Rules for future changes:

- Keep feature modules independent. A feature may expose a public surface through
  its `index.ts`, but sibling features must not import each other's private
  files.
- Keep app orchestration thin. `src/app/` should compose features and adapters,
  not accumulate feature-specific business rules.
- Keep platform and runtime adapters isolated. Electron, browser extension,
  standalone web, Discord bot, storage, and messaging code should sit behind
  narrow interfaces.
- Keep Discord command handlers thin. Commands and button interactions should
  delegate scoring, selection, persistence, and AtCoder verification to small
  service/domain modules.
- Use dependency injection for code that must run across Electron, standalone
  web, or extension contexts.
- Put shared code in `src/shared/` only when it is truly cross-cutting. Do not
  use shared modules as a dumping ground for feature-specific behavior.
- Prefer explicit types and small data contracts over implicit object shapes.
- Add abstractions only when they reduce real coupling or make a boundary easier
  to preserve.

The boundary checker enforces part of this direction for feature imports. Do not
work around it by reaching into private sibling feature modules.

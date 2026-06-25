# Agent Guide

This folder is for AI agents working in this repository. It is not general
contributor documentation.

Read these files in order:

1. `project-overview.md` for what the product is and which surface matters most.
2. `architecture.md` for the desired modular direction and code boundaries.
3. `contracts.md` for runtime behavior that must not be casually changed.
4. `workflows.md` for commands, generated outputs, and verification.

Non-negotiables:

- Preserve the Electron dashboard behavior unless the task explicitly changes it.
- Treat the Discord bot as a separate Node product surface when the task targets
  server/community training workflows.
- Favor cleaner architecture, smaller modules, and independent feature code.
- Keep orchestration thin; avoid pushing product logic into entrypoints or
  platform adapters.
- Avoid editing generated directories: `dist/`, `dist-web/`, `dist-electron/`,
  `release/`, and `node_modules/`.
- Use repository scripts for verification. For non-trivial code changes, run
  `npm run check` before declaring the work complete.

When instructions conflict, prefer protected runtime contracts first, then the
current task, then architecture cleanup.

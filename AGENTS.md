# AI Agent Entry Point

This repository has project guidance for AI agents in `agents/`.

Start with `agents/README.md` before making changes. That index links to the
project overview, architecture direction, workflows, and protected runtime
contracts.

The macOS Electron dashboard is the primary product target. Manifest V3
extension compatibility still exists, but it should not drive architecture
decisions unless the task explicitly targets the extension.

Edit source files, not generated outputs. Do not treat `dist/`, `dist-web/`,
`dist-electron/`, `release/`, or `node_modules/` as source.

For non-trivial code changes, `npm run check` is the default completion gate.

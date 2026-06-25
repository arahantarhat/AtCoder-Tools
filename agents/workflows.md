# Workflows

Canonical commands:

```sh
npm install
npm run check
npm start
npm run build
npm run bot:start
npm run bot:build
npm run dist:mac
```

Command meanings:

- `npm install`: install dependencies.
- `npm run check`: run typecheck, Vitest tests, feature-boundary checks, and the
  extension/web/Electron build plus the Discord bot build.
- `npm start`: build and launch the Electron app.
- `npm run build`: build extension/web/Electron outputs.
- `npm run bot:build`: build the Discord bot into `dist-discord/`.
- `npm run bot:start`: build and run the Discord bot.
- `npm run dist:mac`: run checks and create the unsigned Apple Silicon app
  bundle.

Discord bot environment:

- `DISCORD_BOT_TOKEN`: required bot token.
- `DISCORD_CLIENT_ID`: optional application id; defaults to the logged-in bot id.
- `DISCORD_GUILD_ID`: optional guild id for guild-scoped command registration.
- `DISCORD_DATA_PATH`: optional SQLite path; defaults to `data/bot.sqlite`.

Generated outputs are not source. Do not edit these directories directly:

- `dist/`
- `dist-web/`
- `dist-electron/`
- `dist-discord/`
- `release/`
- `data/`
- `node_modules/`

Expected agent development loop:

1. Inspect the relevant source and tests before editing.
2. Make the smallest change that improves the requested behavior or structure.
3. Keep modules independent and preserve protected runtime contracts.
4. Add or update focused tests when behavior changes.
5. Run appropriate verification. For non-trivial code changes, run
   `npm run check`.

For docs-only changes, manually verify the changed files for accuracy. Runtime
checks are not required unless source, scripts, package metadata, or generated
build behavior changed.

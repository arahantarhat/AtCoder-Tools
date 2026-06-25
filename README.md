# AtCoder Dashboard

Personal macOS Electron app that runs an AtCoder training dashboard on a private
localhost server and opens it in the system default browser.

The dashboard provides Problemset, Stats, Training, Progress, and Settings
sections. It uses Kenkoooo AtCoder Problems data for problem metadata,
difficulty, contests, and public submission fallback.

## Run And Build

```sh
npm install
npm run check
npm start
```

Create the unsigned Apple Silicon application bundle with:

```sh
npm run dist:mac
```

The bundle is written to `release/mac-arm64/AtCoder Dashboard.app`. It can be
moved to `/Applications` and pinned to the Dock.

## Desktop Behavior

- The app owns a dynamic `127.0.0.1` server and opens a new browser tab when
  launched, reactivated, or selected from the menu bar.
- AtCoder login happens in an Electron-owned window. Its cookies remain in the
  Electron session and are not exposed to the localhost page or JSON backups.
- Authenticated submission checks fall back to the public API when necessary.
- Settings and training state are stored in the app's macOS application-data
  directory.
- Quitting the macOS app stops the localhost server.

## Extension Compatibility

The original Manifest V3 extension build remains available. Run `npm run build`
and load this project as an unpacked Chromium extension if needed.

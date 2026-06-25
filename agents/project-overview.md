# Project Overview

AtCoder Dashboard is a personal AtCoder training dashboard. The current primary
product is the macOS Electron launcher that owns a private localhost server and
opens the dashboard in the user's browser.

The dashboard helps a user inspect problems, track solved work, run training
sessions, and review progress. The main user-facing areas are:

- Problemset: browse and filter AtCoder problems.
- Stats: summarize solved work and rating-related information.
- Training: generate sessions and track training outcomes.
- Progress: visualize progress over time.
- Settings: manage the local dashboard account and authentication state.

The app uses AtCoder data and Kenkoooo AtCoder Problems data. AtCoder is used for
authenticated session behavior and user-specific information when available.
Kenkoooo provides problem metadata, difficulties, contests, and public
submission fallback data.

The original Manifest V3 extension build remains available for compatibility.
Do not let extension compatibility dominate design choices unless the task
explicitly targets browser-extension behavior. New product work should treat the
Electron dashboard and localhost web UI as the main surface.

The Discord bot is a secondary product surface for server/community training. It
runs as a separate Node process, uses local SQLite persistence, and should share
AtCoder/problem/training domain logic where practical without depending on
Electron, localhost page state, or MV3 extension runtime behavior.

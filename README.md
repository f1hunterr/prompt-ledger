# Prompt Ledger

A premium, minimal prompt manager — save day-to-day prompts sorted by
client, ready to copy, download, or share. Ships three ways:

- **Web app** (`server.js` + `public/`) — a self-hosted, shared version:
  everyone on the team hits the same URL and sees the same library. No
  accounts — anyone who can reach the URL can view and edit it, so keep it
  on a LAN/VPN rather than the open internet.
- **Shared side-panel extension** (`extension-shared/`) — a thin Chrome
  extension that docks the web app above in a side panel, so it opens
  from the toolbar instead of a bookmarked tab. Same shared data — it's
  just an iframe onto your server, nothing stored in the extension itself.
- **Offline extension** (`manifest.json`, `background.js`, `sidepanel.*`
  at the repo root) — the original single-machine version, data stored
  locally in the browser. Kept as-is for a fully offline, no-server copy.

All three share the same UI and the same export/import JSON format, so
you can move prompts between them.

## Web app — run with Docker

```
mkdir -p data && sudo chown 1000:1000 data   # first run only
docker compose up -d --build
```

Then open `http://<host>:3000`. Data lives in `./data/db.sqlite` on the
host (bind-mounted into the container), so it survives rebuilds and
restarts. `chown 1000:1000` matters because the container runs as the
non-root `node` user — skip it and you'll hit `EACCES` on first write.

Copy `.env.example` to `.env` to override `PORT` if 3000 is taken.

### Run without Docker

```
npm install
node server.js
```

Needs Node 22.5+ (uses the built-in `node:sqlite` module — no native
build step, no extra services). Defaults to port 3000, override with
`PORT=xxxx node server.js`.

### API

`GET /health`, `GET /api/data`, `GET/POST /api/folders`,
`DELETE /api/folders/:id`, `GET/POST /api/prompts`,
`PUT/DELETE /api/prompts/:id`, `GET /api/export`, `POST /api/import`.
All plain JSON, no auth headers required.

## Shared side-panel extension — install (unpacked, ~30 seconds)

Docks your team's hosted web app into Chrome's side panel. Each teammate
installs this once and points it at your server; it's a thin wrapper —
no separate data, no login, same shared library as the web app.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `extension-shared` folder from
   this repo.
4. Click the extension icon in the toolbar to open the side panel. Pin it
   via the puzzle-piece icon for one-click access.
5. First time only: enter your server's address (e.g.
   `http://192.168.1.50:3000`) and click **Connect**. It's saved via
   Chrome sync, so it carries over to your other signed-in Chrome
   browsers. Click the ⚙ in the panel's top bar any time to change it.

## Offline extension — install (unpacked, ~30 seconds)

The original single-machine version — no server, nothing shared, data
stored locally in the browser.

1. Unzip `prompt-ledger.zip` somewhere permanent (don't delete the folder
   after — Chrome loads it from there).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped `prompt-manager` folder
   (the repo root, not `extension-shared`).
5. Click the extension icon in the toolbar — it opens as a side panel
   docked to the browser window, not a popup. Pin it via the puzzle-piece
   icon for one-click access.

## Using it

Same across all three:

- **+ Client** — create a folder per client (e.g. "Lowe's", "Brosa").
- **New prompt** — save a prompt's title + text into a folder.
- **Copy** — copies the prompt text to your clipboard.
- **Download** — saves the prompt as a `.txt` file.
- **Share icon** — copies a formatted block (title + client + prompt) to
  paste into Slack, email, etc.
- **Search bar** — searches titles and prompt text across all folders.
- **⋯ menu** — Export all prompts as one JSON file (backup, or hand to a
  teammate), and Import a JSON file someone shared with you.
- Right-click a folder chip to delete that folder (and its prompts).

Offline extension only: the **✕ button** closes the side panel.

## What changed from the popup version

- **Moved to a side panel** instead of a popup, so it stays open alongside
  the page you're working on and has real vertical room to breathe.
- **Fixed the modal bug** — the New Prompt / New Folder / Delete dialogs
  no longer stack on top of each other. There's now a single modal
  manager: opening one always closes any other, dialogs are centered and
  pinned to the viewport, and only one can ever be visible at a time.
- **Redesigned visual language** — warm paper background, a restrained
  brass accent, a serif wordmark, and muted "binder tab" colors per
  client instead of bright chip colors.
- **Motion pass** — every interactive element (buttons, cards, modals,
  menus) uses intentional easing and duration based on established
  UI-animation practice: fast, custom ease-out curves for entrances,
  quicker exits, subtle press feedback (`scale(0.97)`), staggered card
  entry, and full support for `prefers-reduced-motion`.

## Notes

- **Offline extension**: everything is stored locally in Chrome's
  extension storage on your machine — nothing is sent anywhere.
- **Web app / shared extension**: everything is stored in the SQLite file
  on the server — shared by whoever can reach it, nothing per-browser.
  The shared extension itself only stores the server URL you typed in
  (via `chrome.storage.sync`), not any prompt data.
- To move prompts between the offline extension and the shared
  server, use Export on one side, then Import on the other — same JSON
  format either way.

# Prompt Ledger

A premium, minimal prompt manager — save day-to-day prompts sorted by
client, ready to copy, download, or share. Ships three ways:

- **Web app** (`server.js` + `public/`) — a self-hosted, shared version:
  everyone on the team hits the same URL and sees the same library. No
  accounts — anyone who can reach the URL can view and edit it, so keep it
  on a LAN/VPN rather than the open internet. Visited directly in a
  browser at desktop width, it lays out as a wide dashboard: the ⋯ menu
  (export/import/recycle bin/get-extension) sits as a visible toolbar row
  under the header instead of a hidden dropdown, a grid of prompt cards
  replaces the single column, and a dismissible callout with the Chrome
  extension install steps sits right on the page. Docked in the shared
  extension's side panel, it's the same compact single-column view (⋯
  dropdown included) as before — same page, detected automatically
  (`window.self === window.top` tells it whether it's the top-level page
  or sitting in the extension's iframe), no separate build. Either way, a
  banner appears if the server gets redeployed while your tab is open
  ("Refresh to update") — no page-reload polling library, just a
  timestamp captured at server start (`GET /api/version`) that the page
  compares every few minutes.
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

`GET /health`, `GET /api/version`, `GET /api/data`, `GET/POST /api/folders`,
`DELETE /api/folders/:id`, `GET/POST /api/prompts`,
`PUT/DELETE /api/prompts/:id`, `GET /api/export`, `POST /api/import`,
`GET /api/trash`, `POST /api/trash/folders/:id/restore`,
`POST /api/trash/prompts/:id/restore`, `DELETE /api/trash/folders/:id`,
`DELETE /api/trash/prompts/:id`, `POST /api/trash/empty`.
All plain JSON, no auth headers required. `GET /extension.zip` serves
the shared extension below, pre-configured with this server's address.

### Emergency recovery

"Delete forever" and "Empty recycle bin" don't actually erase anything
server-side — they stamp the row `purged_at` and every normal query
(app, trash view, export) filters it out from there, but the row is
still sitting in `data/db.sqlite`. There's deliberately no button or API
route for undoing that (this app has no login, so anything reachable
from the browser is reachable by anyone) — recovery is a script you run
with shell access to the server:

```
docker compose exec prompt-ledger node scripts/recover-purged.js list
docker compose exec prompt-ledger node scripts/recover-purged.js restore prompt <id>
docker compose exec prompt-ledger node scripts/recover-purged.js restore folder <id>
```

(Drop the `docker compose exec prompt-ledger` prefix if you're running
`node server.js` directly instead of in Docker.) `restore` only clears
`purged_at` — the item lands back in the normal Recycle bin, one more
restore away from being visible in the library again.

## Shared side-panel extension — install (~30 seconds, no typing)

Docks your team's hosted web app into Chrome's side panel. It's a thin
wrapper — no separate data, no login, same shared library as the web app.

Chrome won't let a webpage install an extension automatically (that's a
deliberate browser security limit — no site can silently add itself to
your browser), so **Load unpacked** is still the install step. What *is*
automatic: the download is pre-configured with your server's address, so
there's nothing to type in.

1. In the web app, open the **⋯ menu → Get Chrome extension**, then
   **Download extension (.zip)**. (Or grab `extension-shared/` from this
   repo directly — that copy will ask for a server address on first run
   instead.)
2. Unzip it.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the unzipped folder.
6. Click the toolbar icon — it opens already connected. Pin it via the
   puzzle-piece icon for one-click access. Click the ⚙ in the panel's top
   bar any time to point it at a different server.

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

Web app / shared extension only:

- Deleting a folder or prompt moves it to the **Recycle bin** (⋯ menu)
  instead of destroying it right away. From there you can **restore** it
  or **delete forever**. Restoring a folder also restores whatever
  prompts were in it when it was deleted. Nobody can undo "delete
  forever" or "empty bin" from inside the app — see **Emergency
  recovery** below if that happens by mistake.

Offline extension only:

- Deleting a folder or prompt is immediate and permanent — no recycle
  bin, since there's no server keeping a copy.
- The **✕ button** closes the side panel.

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

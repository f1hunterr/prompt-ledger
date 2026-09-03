# Prompt Ledger

A premium, minimal prompt manager that lives in Chrome's side panel — save
day-to-day prompts sorted by client, ready to copy, download, or share.

## Install (unpacked, ~30 seconds)

1. Unzip `prompt-ledger.zip` somewhere permanent (don't delete the folder
   after — Chrome loads it from there).
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped `prompt-manager` folder.
5. Click the extension icon in the toolbar — it opens as a side panel
   docked to the browser window, not a popup. Pin it via the puzzle-piece
   icon for one-click access.

## Using it

- **+ Client** — create a folder per client (e.g. "Lowe's", "Brosa").
- **New prompt** — save a prompt's title + text into a folder.
- **Copy** — copies the prompt text to your clipboard.
- **Download** — saves the prompt as a `.txt` file.
- **Share icon** — copies a formatted block (title + client + prompt) to
  paste into Slack, email, etc.
- **Search bar** — searches titles and prompt text across all folders.
- **⋯ menu** — Export all prompts as one JSON file (backup, or hand to a
  teammate), and Import a JSON file someone shared with you.
- **✕ button** — closes the side panel.
- Right-click a folder chip to delete that folder (and its prompts).

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

- Everything is stored locally in Chrome's extension storage on your
  machine — nothing is sent anywhere.
- To move your prompts to another computer, use Export, then Import on
  the other machine.

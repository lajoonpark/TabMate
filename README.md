# TabMate

**TabMate** is a Manifest V3 Chrome extension that helps you organise, categorise, and tidy your browser tabs with ease.

## Features

- **Auto-categorisation** — Tabs are automatically grouped into categories (YouTube, Coding, Shopping, Social, and more) based on their domain.
- **Close by category** — Close an entire group of tabs with one click. Pinned and active tabs are always preserved.
- **Duplicate detection** — Instantly spot and remove duplicate tabs, keeping your preferred copy.
- **Undo** — Accidentally closed too many tabs? Restore them with a single click. Undo state persists even after the popup is closed.
- **Saved boards** — Foundation for saving sets of tabs to named boards (data layer in place; full UI coming in a future release).

## Default categories

School · Work · Shopping · Entertainment · Social · Research · Coding · Other

## Running the extension locally

1. Clone the repository:
   ```sh
   git clone https://github.com/lajoonpark/TabMate.git
   cd TabMate
   ```

2. Open Chrome and navigate to `chrome://extensions`.

3. Enable **Developer mode** (toggle in the top-right corner).

4. Click **Load unpacked** and select the `TabMate` folder (the directory that contains `manifest.json`).

5. The **TabMate** icon will appear in your browser toolbar. Click it to open the popup.

> **Note:** After making any code changes, click the refresh icon on the extension card at `chrome://extensions` to reload the extension.

## Project structure

```
manifest.json          MV3 manifest — name, permissions, background module
popup.html             Extension popup shell (390 × 620 px)
popup.js               Popup UI — rendering and event handling
background.js          Service worker — tab close/restore, storage writes
styles.css             CSS custom-properties design system
lib/
  defaults.js          Default categories, boards, and settings
  storage.js           Storage abstraction (sync for settings, local for data)
  utils.js             Shared utilities — URL parsing, categorisation, deduplication
icons/                 Extension icons (16 × 16, 48 × 48, 128 × 128)
```

## Architecture

- **`lib/storage.js`** is the single source of truth for all storage access. UI code never calls `chrome.storage` directly.
- **`lib/utils.js`** contains pure, environment-agnostic functions for URL normalisation, tab categorisation, and duplicate detection. Both the popup and any future settings/options pages can import from it without modification.
- **`lib/defaults.js`** defines the seeded default data: 8 built-in categories, the undeletable "Unorganised" board, and all settings with sensible defaults.
- `chrome.storage.sync` is used for settings and categories (small payloads that sync across devices).
- `chrome.storage.local` is used for boards, saved tabs, and undo state (potentially larger payloads).

## Roadmap

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for the full phased plan.

| Phase | Description | Status |
|---|---|---|
| 1 | Rebrand & data foundation | ✅ Done |
| 2 | Custom categories & settings page | Planned |
| 3 | Boards / tab presets UI | Planned |
| 4 | Keyboard shortcuts & tab groups | Planned |
| 5 | Website / landing page | Planned |
| 6 | Polish, tests & Chrome Web Store | Planned |

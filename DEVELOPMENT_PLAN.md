# TabMate — Development Plan

## 1. Current State

TabMate is a working Manifest V3 Chrome extension (vanilla JS, no build toolchain)
that organises, categorises, and tidies browser tabs. It has evolved well beyond the
original prototype: the popup is backed by a full options page, a shared storage
abstraction, a pure utility layer, and a content script that surfaces helper pop-ups
and save animations on web pages.

### File structure

```
manifest.json      – MV3 manifest (name: "TabMate"; permissions: tabs, storage, tabGroups, scripting; commands; options_ui; content scripts)
popup.html         – 390 × 620 px popup shell with action tiles + collapsible sub-panels
popup.js           – Popup UI logic: organise, close-by-category, duplicates, presets, save tab, shortcuts, pop-ups toggle, undo
settings.html      – Options page: Categories, Presets, Duplicate Detection, Boards, Shortcuts, Notifications
settings.js        – Settings page logic and persistence
background.js      – Service worker: close/restore, duplicate cleanup, tab-watcher pop-ups, command handler, message routing
content.js         – Content script: helper pop-ups + "save tab" fly animation injected on http/https pages
styles.css         – Popup CSS custom-properties design system
settings.css       – Settings page styles
content.css        – Content-script pop-up / animation styles
lib/defaults.js    – Default categories, board, presets, and settings
lib/storage.js     – Storage abstraction (sync for settings/categories; local for presets/boards/savedTabs/undo)
lib/utils.js       – Pure utilities: URL parsing, rule-based categorisation, duplicate detection, close planning
icons/             – TabMate icons (16/48/128) + source SVG
```

### Working features

| Feature | Implementation |
|---|---|
| Rule-based categorisation | 8 built-in categories (Work, School, Coding, Shopping, Entertainment, Social, Research, Other) matched by 4 rule types (exact domain, domain contains, URL contains, title contains); "New Tabs" bucket + "Other" fallback |
| Custom categories | Full CRUD in Settings: add/edit/delete, reorder by priority, tabGroups colour picker, multi-rule editor, URL/title match preview. Stored in `chrome.storage.sync` as `customCategories` |
| Organise into Chrome tab groups | "Organise Tabs" groups category tabs via `chrome.tabGroups.update` with per-category colour and title; skips pinned tabs and internal pages; feature-detects `chrome.tabGroups` |
| Close by category | Batch-close per category, skipping pinned/active tabs, with a confirm gate above the configured threshold |
| Duplicate detection | Exact and generalised modes with `ignoreHash` / `ignoreQuery` options; active tab and (optionally) pinned tabs protected; popup badge counts removable duplicates |
| Delete duplicates | Per-group detail list + delete-all; duplicates cleanup also triggered from content-script pop-up actions |
| Undo last close | Payload in `chrome.storage.local` (`lastClosedTabs`); restores via `chrome.tabs.create`; survives popup close |
| Presets | CRUD in Settings: name, description, keep/replace open behaviour, category, shortcut reference, reorderable tab list, import-current-tabs. Opened (or "Replace"-opened) from the popup |
| Boards | Pinterest-style boards: CRUD, undeletable system "Unorganised" default, set-default, per-board saved tabs with favicons |
| Board tab management | Open all / open selected, move tabs between boards, delete selected, select-all/deselect |
| Save current tab | Popup save panel with board picker, duplicate-in-board warning with force-save, save-confirm fly animation on the page |
| Keyboard shortcuts | 8 `commands` in the manifest (organise, delete duplicates, save current tab, open preset slot, save to board slots 1–3, toggle pop-ups); slot-to-preset/board assignment UI in Settings; command list shown in the popup |
| Helper pop-ups (content script) | Background tab-watcher fires many-tabs / new-tabs / duplicates pop-ups inside web pages, with per-type thresholds, corner position, cooldowns, and action buttons |
| Notification settings | Global toggle + per-type toggles, thresholds, corner position, and save-confirm animation toggle |
| Storage architecture | `lib/storage.js` is the single store of truth; defaults seeded on install/update; sync/local split; legacy boards→presets migration |
| Rebrand | Manifest, popup, and settings all branded "TabMate"; README rewritten with features and install steps |

## 2. Current Limitations

1. **Native browser dialogs** — `window.alert`, `window.confirm`, and `window.prompt` are still used in both the popup and the settings page; no in-house modal component.
2. **Single-level undo** — only the most recent close batch is recoverable.
3. **No dark mode** — both CSS files set `color-scheme: light`; no `prefers-color-scheme` handling or manual override.
4. **No website** — no landing page exists; the popup's fallback link points at `tabmate.app`, which is not yet published.
5. **No tests** — zero automated coverage.
6. **No Chrome Web Store release** — packaged distribution not yet done.
7. **No cross-browser port** — `chrome.*` APIs are used directly; a Firefox (etc.) port would require a `browser.*` compatibility shim.
8. **Undo not synced** — `lastClosedTabs` lives in `chrome.storage.local` only.

## 3. Current Architecture

### Extension (Manifest V3)

```
manifest.json          – permissions: tabs, storage, tabGroups, scripting; options_ui → settings.html; content_scripts on http/https; 8 commands
background.js          – message router, close/restore, duplicate cleanup, tab-watcher pop-up dispatcher, command executor
popup.html / popup.js  – action tiles + collapsible sub-panels (Categories, Duplicates, Presets, Save, Shortcuts) + undo banner
settings.html / .js    – six-section options page (single file, sidebar nav)
content.js / content.css – page-level helper pop-ups + save fly animation
styles.css             – popup design system (custom properties, no framework)
icons/                 – TabMate-branded assets
```

### Storage schema (implemented)

```jsonc
{
  // chrome.storage.sync
  "settings": {
    "confirmationThreshold": 5,
    "showDuplicates": true,
    "defaultBoardId": "unorganised",
    "notifications": { "enabled": true, "showOnClose": true },
    "popupNotifications": {
      "enabled": true, "position": "bottom-left",
      "newTabsEnabled": true, "newTabsThreshold": 8,
      "duplicatesEnabled": true, "duplicatesThreshold": 3,
      "manyTabsEnabled": true, "manyTabsThreshold": 25,
      "saveConfirmEnabled": true
    },
    "duplicateDetection": {
      "enabled": true, "mode": "exact",
      "ignoreHash": true, "ignoreQuery": false, "closePinnedTabs": false
    },
    "keyboardShortcuts": { "closeDuplicates": "", "openPopup": "", "undo": "" },
    "shortcutSlots": { "presetSlot1": "", "boardSlot1": "", "boardSlot2": "", "boardSlot3": "" }
  },
  "customCategories": [
    { "id": "work", "name": "Work", "colour": "blue", "builtin": true, "priority": 10,
      "rules": [ { "type": "domainContains", "value": "slack.com" } ] }
  ],

  // chrome.storage.local
  "boards": [
    { "id": "unorganised", "name": "Unorganised", "createdAt": 0, "updatedAt": 0,
      "isSystem": true, "isDefault": true }
  ],
  "presets": [
    { "id": "preset_…", "name": "School", "description": "…",
      "tabs": [ { "title": "…", "url": "https://…" } ],
      "openBehavior": "addToCurrentTabs" }
  ],
  "savedTabs": [
    { "id": "stab_…", "boardId": "…", "title": "…", "url": "…",
      "faviconUrl": "…", "savedAt": 0 }
  ],
  "lastClosedTabs": [ { "title": "…", "url": "…" } ]
}
```

## 4. Implementation Phases

### Phase 1 — Rebrand & foundation ✅ Done
- Renamed extension and UIs to **TabMate** (manifest, popup, settings).
- Created shared foundation: `lib/defaults.js`, `lib/storage.js`, `lib/utils.js`.
- Seeded defaults on install/update; established the sync-vs-local storage split.
- Rewrote README with description, features, install steps, and structure.

### Phase 2 — Settings page & custom category system ✅ Done
- Added `settings.html` / `settings.js` options page (`options_ui`, open-in-tab).
- Replaced hardcoded rules with a rule-based category model stored in `customCategories`.
- Full category CRUD: reordering, colour picker, rule editor, and URL/title match preview.
- Added tab-grouping awareness: categories carry `colour` + `priority` for `chrome.tabGroups`.

### Phase 3 — Boards & tab presets ✅ Done
- Added **Boards** (Pinterest-style) and **Presets** data models with full settings UI.
- Popup: Save Current Tab panel with board picker and duplicate-in-board handling.
- Popup: Open Preset panel with keep/replace open behaviour.
- Board tab management: open/move/delete selected tabs, open all, default-board selection.
- Legacy boards→presets migration in `lib/storage.js`.

### Phase 4 — Keyboard shortcuts, tab groups & helper pop-ups ✅ Done
- Added 8 `commands` to the manifest with a background `onCommand` handler.
- Shortcut slot assignments (preset slot + board slots 1–3) configurable in Settings.
- Integrated `chrome.tabGroups` via the popup "Organise Tabs" action.
- Added content script with page-level helper pop-ups (many-tabs / new-tabs / duplicates)
  driven by a background tab-watcher, plus a save-tab fly animation.
- Added full pop-up notification settings (position, thresholds, per-type toggles).

### Phase 5 — Website / landing page (Not started)
- Create `/docs` folder with `index.html`, `styles.css`, and screenshot assets.
- Enable GitHub Pages on the `/docs` folder.
- Publish landing page: hero, feature highlights, install button, changelog.

### Phase 6 — Polish & release (Not started)
- Replace `window.alert` / `window.confirm` / `window.prompt` with custom modal components.
- Add dark-mode support (`prefers-color-scheme` + manual override stored in settings).
- Multi-level undo (keep last N close actions).
- Unit tests for `lib/utils.js` using a lightweight test runner (Vitest or the Node test runner).
- Publish to the Chrome Web Store.

## 5. Risks and Browser API Limitations

| Risk | Detail |
|---|---|
| MV3 service worker lifetime | The service worker can be killed mid-operation. Undo state is persisted to storage, which mitigates this. Long-running tasks must be avoided. |
| `tabGroups` API availability | `chrome.tabGroups` requires the `tabGroups` permission and Chrome 89+; the popup feature-detects it. Not available in Firefox. |
| `chrome.storage.sync` quota | Sync storage is limited to 100 KB total and 8 KB per item. Categories and settings stay in sync; larger data (boards, presets, saved tabs) uses `storage.local`. |
| `window.confirm` in popups | Some Chromium builds suppress `window.confirm` in extension popups. Still used; replacement is planned in Phase 6. |
| Cross-browser support | The extension uses `chrome.*` APIs directly. A Firefox port would require a `browser.*` compatibility shim. |
| `manifest_version: 3` | MV3 service workers cannot use persistent background pages; existing design is already MV3-safe. |
| Content Security Policy | MV3 restricts `eval` and remote scripts; all current code is inline-free and CSP-compatible. |
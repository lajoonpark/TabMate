# TabMate — Development Plan

## 1. Existing Prototype Summary

The repository contains a working Manifest V3 Chrome extension that was originally called **TabCloser**,
then renamed to **TabSweep** in the manifest (the README still says "TabCloser"). It is a lean,
vanilla-JS popup extension with no build toolchain or dependencies.

### File structure

```
manifest.json      – MV3 manifest (name: "TabSweep", permissions: tabs + storage)
popup.html         – 390 × 620 px popup shell
popup.js           – All UI logic (~460 lines, vanilla JS)
background.js      – Service worker: close-tabs / restore-tabs / get-undo-state messages
styles.css         – CSS custom-properties design system, card layout
icons/             – icon16.png, icon48.png, icon128.png
README.md          – One-line stub ("# TabCloser")
```

### Working features

| Feature | Implementation |
|---|---|
| Tab categorisation | 12 hardcoded domain-rule categories + "New Tabs" + "Other" fallback |
| Close by category | `chrome.tabs.remove` via background service worker, skips pinned/active |
| Confirmation gate | `window.confirm` for batches > 5 tabs |
| Duplicate detection | Groups tabs by exact URL, lists in a separate section |
| Close duplicates | Keeps the active/pinned copy, closes the rest |
| Undo last close | Payload stored in `chrome.storage.local`; restores with `chrome.tabs.create` |
| Undo survives popup close | State loaded from storage on every popup open |

### Storage usage

- `chrome.storage.local` — single key `lastClosedTabs` (array of `{title, url}` objects)

---

## 2. Current Limitations

1. **Name / identity mismatch** — manifest says "TabSweep", README says "TabCloser"; no "TabMate" branding exists yet.
2. **Hardcoded categories** — rules live in `popup.js` constants; users cannot add, edit, or remove categories.
3. **No tab groups** — the extension does not use the Chrome `tabGroups` API; grouping is visual only inside the popup.
4. **No presets / boards** — there is no way to save a named set of tabs for later reopening (Pinterest-style boards).
5. **No keyboard shortcuts** — no `commands` manifest key; all actions require mouse clicks.
6. **No settings / options page** — no `chrome_url_overrides` or `options_page`; configuration is impossible.
7. **No content scripts** — the extension is popup-only; it cannot react to page content or inject UI.
8. **Single undo level** — only the most recent close batch is recoverable.
9. **`window.confirm` for confirmations** — native browser dialogs block the event loop and cannot be styled.
10. **No website** — the product has no landing page or web presence.
11. **No dark mode** — CSS uses `color-scheme: light` only.
12. **No tests** — zero automated coverage.
13. **Shallow README** — a single heading; no installation instructions, screenshots, or feature list.

---

## 3. Proposed Architecture

### Extension (Manifest V3)

```
manifest.json          – Add commands, options_page, host_permissions if needed
background.js          – Service worker; expand message handlers; manage boards + presets
popup.html / popup.js  – Upgrade to tabbed UI (Categories · Boards · Settings)
options.html / .js     – Full settings page (custom categories, keyboard shortcut hints)
content.js             – (Phase 2) Optional: context-menu / page-level interactions
styles.css             – Extend with dark-mode support, new components
icons/                 – Replace with "TabMate" branded assets
```

### Storage schema (chrome.storage.local / sync)

```jsonc
{
  // Undo (existing)
  "lastClosedTabs": [ { "title": "…", "url": "…" } ],

  // Custom categories (new)
  "customCategories": [
    { "id": "uuid", "name": "…", "domains": ["example.com"] }
  ],

  // Boards / presets (new)
  "boards": [
    { "id": "uuid", "name": "…", "tabs": [ { "title": "…", "url": "…" } ] }
  ],

  // Settings (new)
  "settings": {
    "confirmationThreshold": 5,
    "showDuplicates": true,
    "darkMode": "auto"   // "auto" | "light" | "dark"
  }
}
```

### Website (Phase 3)

- Static HTML/CSS landing page (no framework required for v1).
- Hosted via GitHub Pages from a `/docs` folder or a dedicated branch.
- Sections: hero, feature highlights, install CTA, FAQ.

---

## 4. Implementation Phases

### Phase 1 — Rebrand & foundation (this pass)
- Rename extension to **TabMate** across manifest, popup title, and README.
- Expand README with description, features, and installation instructions.
- Create this DEVELOPMENT_PLAN.md.
- No logic changes; validate existing features still work.

### Phase 2 — Custom categories & settings
- Add `options.html` / `options.js` settings page.
- Move `CATEGORY_RULES` to `chrome.storage.local`; allow CRUD from the options page.
- Replace `window.confirm` with an in-popup confirmation component.
- Add dark-mode support (`prefers-color-scheme` + manual override stored in settings).

### Phase 3 — Boards / tab presets
- Add a **Boards** tab panel in the popup.
- Allow users to save the current window's open tabs as a named board.
- Allow reopening a saved board (opens all URLs in new tabs).
- Allow deleting individual tabs from a board or deleting the whole board.

### Phase 4 — Keyboard shortcuts & Chrome tab groups
- Add `commands` to `manifest.json` for close-duplicates, open-popup, undo.
- Integrate `chrome.tabGroups` API to visually group matched category tabs in the browser.
- Add a "Group tabs" button per category card as an alternative to closing.

### Phase 5 — Website
- Create `/docs` folder with `index.html`, `styles.css`, and screenshot assets.
- Enable GitHub Pages on the `/docs` folder.
- Publish landing page: hero, feature highlights, install button, changelog.

### Phase 6 — Polish & release
- Replace `window.alert` / `window.confirm` entirely with custom modal components.
- Multi-level undo (keep last N close actions).
- Unit tests using a lightweight test runner (e.g. Vitest or plain Node test runner).
- Publish to Chrome Web Store.

---

## 5. Risks and Browser API Limitations

| Risk | Detail |
|---|---|
| MV3 service worker lifetime | Background service worker can be killed mid-operation. Undo state is already persisted to storage, which mitigates this. Long-running tasks must be avoided. |
| `tabGroups` API availability | `chrome.tabGroups` requires `tabGroups` permission and Chrome 89+; not available in Firefox. Feature-detect at runtime. |
| `chrome.storage.sync` quota | Sync storage is limited to 100 KB total and 8 KB per item. Large boards must use `storage.local`. |
| `window.confirm` in popups | Some Chromium builds suppress `window.confirm` in extension popups. Already flagged as a limitation; replace in Phase 2. |
| Cross-browser support | The extension uses `chrome.*` APIs directly. A Firefox port would require a `browser.*` compatibility shim. |
| `manifest_version: 3` | MV3 service workers cannot use persistent background pages. Existing design is already MV3-safe. |
| Content Security Policy | MV3 restricts `eval` and remote scripts; all current code is inline-free and CSP-compatible. |

---

## 6. First Pass — What Will Be Done Now (Phase 1)

- [x] Inspect and document the existing prototype (this file).
- [ ] Update `manifest.json`: rename to **TabMate**, bump description.
- [ ] Update `popup.html`: title and h1 to **TabMate**.
- [ ] Rewrite `README.md`: full description, feature list, installation steps, roadmap link.

No logic, storage schema, or UI layout changes will be made in this pass. The goal is a clean
rebrand that leaves all existing working functionality intact, setting a stable baseline before
feature work begins in Phase 2.

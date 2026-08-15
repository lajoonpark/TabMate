# AI tab categorization (OpenRouter)

Replace rule-based URL matching with client-side OpenRouter categorization. No backend.

## Decisions

- AI invents category names (not a fixed user list).
- Persist `url → category` in `chrome.storage.local`. Next categorize sends **only uncategorized tabs**, plus the existing category vocabulary so names do not fragment.
- Main action is incremental. Secondary **Recategorize all** wipes assignments and resends every open tab.
- API key is pasted in the **settings page** (this is a Chrome MV3 extension, not a website).
- Organise Tabs and the `organise-tabs` command run incremental categorize first, then group.
- Close by Category uses saved AI assignments, not rules.
- Rule editor and `DEFAULT_CATEGORIES` matching are removed.

## Architecture

```
popup / settings  →  chrome.runtime.sendMessage
                          ↓
                   background.js  (fetch; popup can close)
                          ↓
              lib/openrouter.js   (request/parse)
              lib/categorize-ai.js (cache merge, apply)
              lib/storage.js      (local only for key + memory)
```

Keep `lib/utils.js` chrome-free. Network stays out of utils.

New files:

- `lib/openrouter.js` — OpenRouter client, prompt, JSON parse
- `lib/categorize-ai.js` — assignment cache, grouping, incremental split

## Data

All AI state in **`chrome.storage.local`** (never sync — API key + quota).

```js
// key: aiConfig
{
  apiKey: '',                    // user-pasted OpenRouter key
  model: 'google/gemini-2.5-flash',
  customModel: '',               // if model === 'custom', use this
  lastError: '',
  lastRunAt: 0
}

// key: aiMemory
{
  categories: [
    { name: 'Work', colour: 'blue' }
  ],
  assignments: {
    // cache key = assignmentKey(url)
    'https://github.com/org/repo': { categoryName: 'Coding', colour: 'green', assignedAt: 0 }
  }
}
```

`assignmentKey(url)`: origin + pathname, lowercase, strip `www.`, drop hash and query (privacy + cache hits). YouTube/search still categorize from **title**.

Skip AI for `isNewTab` / `isInternalUrl`. Those stay in a local **New Tabs** / ignored bucket.

Storage API (`lib/storage.js`):

- `getAiConfig` / `setAiConfig`
- `getAiMemory` / `setAiMemory`
- `clearAiAssignments()` — wipe assignments, keep category vocabulary
- `resetAiMemory()` — wipe both (Recategorize all)
- Stop seeding `customCategories` on install. Leave leftover sync data unused.
- Delete category rule editor code; keep `CATEGORY_COLOURS` and `colourHex`.

`DEFAULT_SETTINGS` does **not** store the key.

## OpenRouter

Manifest:

```json
"host_permissions": ["https://openrouter.ai/*"]
```

`POST https://openrouter.ai/api/v1/chat/completions`

Headers: `Authorization: Bearer <key>`, `Content-Type: application/json`, `HTTP-Referer: https://tabmate.app`, `X-OpenRouter-Title: TabMate`.

Body:

```js
{
  model,
  temperature: 0.2,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify(payload) }
  ]
}
```

`payload`:

```js
{
  existingCategories: [{ name, colour }], // empty on first run / recategorize-all
  tabs: [{ id: '<stable index or tab.id>', title, host, path }]
}
```

Do not send query strings, cookies, or the API key anywhere except the Authorization header.

Expected model JSON:

```json
{
  "categories": [
    { "name": "Coding", "colour": "green" }
  ],
  "assignments": [
    { "id": "123", "category": "Coding" }
  ]
}
```

Rules in the system prompt:

- Prefer `existingCategories` when they fit; invent a new name only when none fit.
- 2–8 categories for a typical window; short names (≤32 chars).
- `colour` must be one of: grey, blue, red, yellow, green, pink, purple, cyan, orange.
- Every input tab id must appear exactly once.
- New category names must not collide case-insensitively with existing ones.

Parse: read `choices[0].message.content`, strip ``` fences, `JSON.parse`. Validate colours against `CATEGORY_COLOURS`. Unknown / missing assignment → `Other` (grey). Merge new category names into `aiMemory.categories`.

Timeout 45s via `AbortController`. Map 401/402/429 to short user strings.

Curated models (settings `<select>`):

| id | label |
|---|---|
| `google/gemini-2.5-flash` | Gemini 2.5 Flash (default, cheap) |
| `openai/gpt-4o-mini` | GPT-4o mini |
| `anthropic/claude-3.5-haiku` | Claude Haiku |
| `meta-llama/llama-3.3-70b-instruct` | Llama 3.3 70B |
| `custom` | Custom model id |

Settings: optional **Load models** → `GET https://openrouter.ai/api/v1/models` (auth header) to refresh the dropdown; fall back to the curated list on failure.

**Test connection**: tiny `chat/completions` (`messages: [{role:'user',content:'ping'}]`, `max_tokens: 1`).

## Categorize flow

`ensureCategorized({ mode: 'incremental' | 'all' })` in background:

1. Load `aiConfig`. If no key → `{ ok:false, code:'no-key' }`.
2. Query `chrome.tabs.query({})`.
3. If `mode === 'all'`, `resetAiMemory()` (or clear assignments only and keep names — **clear assignments + categories** so the model can reinvent; recommended).
4. Split tabs: internal/new-tab vs already assigned vs unknown.
5. If unknown is empty, return grouped result (no network).
6. One request with unknown tabs + `existingCategories`.
7. Merge assignments + new category names; persist.
8. Return `Map<name, tabs[]>` via `groupTabsByAiMemory`.

`groupTabsByAiMemory(tabs, memory)`:

- New tab URLs → `New Tabs`
- Assigned → category name
- Unassigned http(s) → `Uncategorised`
- Skip internals in Organise (existing `isInternalUrl` / pinned filter)

Organise Tabs / command: `ensureCategorized({ mode:'incremental' })` then existing `chrome.tabs.group` + `tabGroups.update` using colours from memory (same fallback colour rotation as today).

## UI (keep tokens / classes)

### Settings — replace Categories section

Rename nav + `#section-categories` to **AI Categorization**.

Reuse `.setting-card`, `.editor-field`, `.editor-label`, `.editor-input`, `.editor-select`, `.btn-primary`, `.btn-secondary`, `.toggle`, `.setting-status`, colour dots.

Contents:

1. API key — `input type="password"` + show/hide; Save writes `aiConfig` immediately.
2. Model select + custom id field when `custom`.
3. Test connection → `.setting-status` / `--error`.
4. Memory: “N sites remembered · M categories”. Buttons: **Clear memory**, **Recategorize all next run** (just clears; next Organise/Categorize sends everything).
5. Learned categories list (same row chrome as old `.cat-item` but **no rules**): colour dot, name, count of assignments. Allow rename + recolour (rewrite matching assignments). Delete category unassigns those URLs so the next incremental run re-asks.

Remove: add-category, rule editor, preview-by-URL, reorder-by-priority, `DEFAULT_CATEGORIES` UI.

### Popup

Do not add a 7th tile (grid stays 2×3).

- **Organise Tabs** subtitle → `AI tab groups`. Click: incremental AI → group. Loading: disable tile, subtitle `Categorising…`.
- **Close by Category** panel header: `Categorise new` (incremental) + text button `Recategorise all`. Rows from `groupTabsByAiMemory`. Show `Uncategorised` if any.
- Missing key: `window.alert` then `chrome.runtime.openOptionsPage()` (same pattern as other errors).
- After success, `refreshTabs()` and re-render rows.

## Background messages

```js
{ type: 'categorize-tabs', mode: 'incremental' | 'all' }
{ type: 'test-openrouter' }
```

Replies: `{ ok, grouped?, error?, code?, uncategorizedCount? }`.

Guard concurrent runs with an in-flight promise (ignore second click).

## Files to change

| File | Change |
|---|---|
| `manifest.json` | `host_permissions` |
| `lib/defaults.js` | Drop rule typedefs / `DEFAULT_CATEGORIES` usage; add AI typedefs |
| `lib/storage.js` | AI getters/setters; stop seeding categories |
| `lib/utils.js` | Keep URL/colour/new-tab helpers; stop using rule matcher in popup |
| `lib/openrouter.js` | **new** |
| `lib/categorize-ai.js` | **new** |
| `background.js` | Message handlers + organise command uses AI then groups |
| `popup.js` / `popup.html` | Organise + close-by-category AI |
| `settings.js` / `settings.html` | Replace Categories section |
| `settings.css` | Only if needed (prefer existing classes) |

Remove dead `categorizeTabs`, `CATEGORY_RULES`, `matchTabToCategory` call sites. Can leave unused helpers deleted.

## Failure modes

- No key / bad key / no credits / rate limit → status string, no partial overwrite of existing assignments.
- Malformed JSON → retry once with a “return JSON only” user message; then fail.
- SW killed mid-fetch → user retries; cache stays consistent (write only after full parse).
- Duplicate category names (case) → normalize to first spelling.
- Organise with only Uncategorised and no key → open settings.

## Validation

- Manual: save key → test connection → Organise with mixed tabs → groups appear.
- Close popup mid-request; groups/memory still persist.
- Second Organise with one new tab → only that tab is sent (check via temp `console` or by inspecting request in service worker).
- Recategorize all → new names allowed; old assignments gone.
- Rename category in settings → popup rows and next Organise use new name.
- No `chrome.storage` calls outside `lib/storage.js`.
- UI matches existing Inter / token palette / button classes.

## Out of scope

- Other providers, backend, streaming, auto-run on every tab open, dark mode, tests (none exist today).

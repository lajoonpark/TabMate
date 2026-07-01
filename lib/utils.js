/**
 * Shared utilities for TabMate.
 *
 * This module is environment-agnostic (no DOM or chrome.* calls) so it can be
 * imported by the extension popup, background service worker, and any future
 * settings or website pages without modification.
 */

// Raw URL prefixes/exact matches for browser new-tab and speed-dial pages.
export const NEW_TAB_URL_PATTERNS = [
  'chrome://newtab/',
  'opera://startpage/',
  'edge://newtab/',
  'about:newtab',
  'about:blank',
];

export const MAX_VISIBLE_TABS_PER_CATEGORY = 8;

/**
 * Valid Chrome tabGroups colour tokens, with their approximate CSS hex values
 * for display in the settings UI.
 *
 * @type {{ value: string, label: string, hex: string }[]}
 */
export const CATEGORY_COLOURS = [
  { value: 'grey',   label: 'Grey',   hex: '#9ca3af' },
  { value: 'blue',   label: 'Blue',   hex: '#3b82f6' },
  { value: 'red',    label: 'Red',    hex: '#ef4444' },
  { value: 'yellow', label: 'Yellow', hex: '#eab308' },
  { value: 'green',  label: 'Green',  hex: '#22c55e' },
  { value: 'pink',   label: 'Pink',   hex: '#ec4899' },
  { value: 'purple', label: 'Purple', hex: '#a855f7' },
  { value: 'cyan',   label: 'Cyan',   hex: '#06b6d4' },
  { value: 'orange', label: 'Orange', hex: '#f97316' },
];

// --- URL utilities ---

/**
 * Returns a normalised version of a URL suitable for deduplication comparisons.
 * Optionally strips the URL fragment (#...) and/or all query parameters.
 *
 * @param {string} url
 * @param {{ ignoreHash?: boolean, ignoreQuery?: boolean }} [options]
 * @returns {string}
 */
export function normalizeUrl(url, { ignoreHash = true, ignoreQuery = false } = {}) {
  try {
    const parsed = new URL(url);
    if (ignoreQuery) parsed.search = '';
    if (ignoreHash) parsed.hash = '';
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * Safely parses a tab URL. Returns null for non-http(s) URLs or malformed URLs.
 *
 * @param {string | undefined} url
 * @returns {{ hostname: string, pathname: string, searchParams: URLSearchParams } | null}
 */
export function parseTabUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return {
      hostname: parsed.hostname.replace(/^www\./, ''),
      pathname: parsed.pathname,
      searchParams: parsed.searchParams,
    };
  } catch {
    return null;
  }
}

/**
 * Returns true if the URL is a browser new-tab or speed-dial page.
 *
 * @param {string | undefined} url
 * @returns {boolean}
 */
export function isNewTab(url) {
  if (!url) return false;
  return NEW_TAB_URL_PATTERNS.some((pattern) => url === pattern || url.startsWith(pattern));
}

/**
 * Returns true if the URL is an internal browser page (chrome://, about:,
 * edge://, etc.) that cannot be added to a tab group.
 *
 * @param {string | undefined} url
 * @returns {boolean}
 */
export function isInternalUrl(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|edge|about|moz-extension|opera|brave):/.test(url);
}

/**
 * Converts a tab URL to a short display-friendly domain string.
 *
 * @param {string | undefined} url
 * @returns {string}
 */
export function extractDomain(url) {
  const parsed = parseTabUrl(url);
  return parsed ? parsed.hostname : 'Non-web tab';
}

/**
 * Returns true when `hostname` equals `domain` or is a subdomain of it.
 *
 * @param {string} hostname
 * @param {string} domain
 * @returns {boolean}
 */
export function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

// --- Rule-based tab categorisation ---

/**
 * Tests whether a single browser tab matches a single category rule.
 *
 * @param {chrome.tabs.Tab} tab
 * @param {import('./defaults.js').CategoryRule} rule
 * @returns {boolean}
 */
function matchRule(tab, rule) {
  const url = (tab.url || '').toLowerCase();
  const title = (tab.title || '').toLowerCase();
  const parsed = parseTabUrl(tab.url);
  const hostname = parsed ? parsed.hostname.toLowerCase() : '';
  const value = (rule.value || '').toLowerCase();

  switch (rule.type) {
    case 'exactDomain':
      return hostname === value;
    case 'domainContains':
      return matchesDomain(hostname, value) || hostname.includes(value);
    case 'urlContains':
      return url.includes(value);
    case 'titleContains':
      return title.includes(value);
    default:
      return false;
  }
}

/**
 * Returns true if the given tab matches any rule in the category.
 *
 * @param {chrome.tabs.Tab} tab
 * @param {import('./defaults.js').Category} category
 * @returns {boolean}
 */
export function matchTabToCategory(tab, category) {
  if (!Array.isArray(category.rules) || category.rules.length === 0) return false;
  return category.rules.some((rule) => matchRule(tab, rule));
}

/**
 * Groups browser tabs into named categories using stored user categories.
 *
 * Ordering:
 *   1. Categories sorted by `priority` (ascending); "Other" (id='other') is
 *      always the final fallback regardless of its priority value.
 *   2. New-tab pages go to a "New Tabs" bucket.
 *   3. Tabs that match no category go to "Other".
 *
 * @param {chrome.tabs.Tab[]} tabs
 * @param {import('./defaults.js').Category[]} categories
 * @returns {Map<string, chrome.tabs.Tab[]>}
 */
export function categorizeTabsWithCategories(tabs, categories) {
  const sorted = [...categories].sort((a, b) => (a.priority ?? 500) - (b.priority ?? 500));
  const matchable = sorted.filter((c) => c.id !== 'other');
  const otherCat = sorted.find((c) => c.id === 'other') ?? { id: 'other', name: 'Other', colour: 'grey', rules: [] };

  const result = new Map();
  result.set('New Tabs', []);
  for (const cat of matchable) {
    result.set(cat.name, []);
  }
  result.set(otherCat.name, []);

  for (const tab of tabs) {
    if (isNewTab(tab.url)) {
      result.get('New Tabs').push(tab);
      continue;
    }

    const matched = matchable.find((cat) => matchTabToCategory(tab, cat));
    const targetName = matched ? matched.name : otherCat.name;

    if (!result.has(targetName)) result.set(targetName, []);
    result.get(targetName).push(tab);
  }

  return result;
}

/**
 * Legacy hard-coded domain rules kept for reference. The active code now uses
 * the rule-based system in `categorizeTabsWithCategories`.
 *
 * @type {{ name: string, matcher: (parsed: { hostname: string, pathname: string, searchParams: URLSearchParams }) => boolean }[]}
 */
export const CATEGORY_RULES = [
  { name: 'Canva', matcher: ({ hostname }) => matchesDomain(hostname, 'canva.com') },
  { name: 'YouTube', matcher: ({ hostname }) => matchesDomain(hostname, 'youtube.com') },
  {
    name: 'Google Docs',
    matcher: ({ hostname }) =>
      ['docs.google.com', 'sheets.google.com', 'slides.google.com'].some((domain) =>
        matchesDomain(hostname, domain)
      ),
  },
  {
    name: 'Coding',
    matcher: ({ hostname }) =>
      ['github.com', 'vercel.com', 'supabase.com', 'stackoverflow.com'].some((domain) =>
        matchesDomain(hostname, domain)
      ),
  },
  {
    name: 'AI Tools',
    matcher: ({ hostname }) =>
      ['chatgpt.com', 'claude.ai', 'gemini.google.com'].some((domain) =>
        matchesDomain(hostname, domain)
      ),
  },
  {
    name: 'Shopping',
    matcher: ({ hostname }) =>
      ['amazon.com', 'trademe.co.nz', 'ebay.com'].some((domain) =>
        matchesDomain(hostname, domain)
      ),
  },
  {
    name: 'Social',
    matcher: ({ hostname }) =>
      ['facebook.com', 'instagram.com', 'reddit.com', 'x.com', 'twitter.com', 'tiktok.com'].some(
        (domain) => matchesDomain(hostname, domain)
      ),
  },
  {
    name: 'Search / Rabbit Holes',
    matcher: ({ hostname, pathname, searchParams }) => {
      if (matchesDomain(hostname, 'google.com') && pathname === '/search') return true;
      if (matchesDomain(hostname, 'bing.com') && pathname === '/search') return true;
      if (matchesDomain(hostname, 'duckduckgo.com') && searchParams.has('q')) return true;
      return false;
    },
  },
  {
    name: 'Work / School',
    matcher: ({ hostname }) =>
      [
        'teams.microsoft.com',
        'office.com',
        'outlook.office.com',
        'sharepoint.com',
        'onedrive.live.com',
        'mail.google.com',
        'calendar.google.com',
        'meet.google.com',
        'zoom.us',
        'notion.so',
        'slack.com',
      ].some((domain) => matchesDomain(hostname, domain)),
  },
  {
    name: 'Entertainment & Streaming',
    matcher: ({ hostname }) =>
      [
        'netflix.com',
        'disneyplus.com',
        'hulu.com',
        'primevideo.com',
        'twitch.tv',
        'spotify.com',
        'soundcloud.com',
        'crunchyroll.com',
      ].some((domain) => matchesDomain(hostname, domain)),
  },
  {
    name: 'News & Reading',
    matcher: ({ hostname }) =>
      [
        'bbc.com',
        'bbc.co.uk',
        'cnn.com',
        'nytimes.com',
        'theguardian.com',
        'medium.com',
        'substack.com',
        'wikipedia.org',
      ].some((domain) => matchesDomain(hostname, domain)),
  },
];

/**
 * Groups browser tabs into named categories using the provided rules.
 * New-tab pages are placed in "New Tabs"; unmatched tabs go to "Other".
 *
 * @param {chrome.tabs.Tab[]} tabs
 * @param {typeof CATEGORY_RULES} [rules]
 * @returns {Map<string, chrome.tabs.Tab[]>}
 */
export function categorizeTabs(tabs, rules = CATEGORY_RULES) {
  const categories = new Map([['New Tabs', []], ...rules.map((rule) => [rule.name, []])]);
  categories.set('Other', []);

  tabs.forEach((tab) => {
    if (isNewTab(tab.url)) {
      categories.get('New Tabs').push(tab);
      return;
    }

    const parsed = parseTabUrl(tab.url);
    if (!parsed) {
      categories.get('Other').push(tab);
      return;
    }

    const matchedRule = rules.find((rule) => rule.matcher(parsed));
    const categoryName = matchedRule ? matchedRule.name : 'Other';
    categories.get(categoryName).push(tab);
  });

  return categories;
}

/**
 * Finds groups of tabs sharing the same (optionally normalised) URL.
 * Only groups with two or more tabs are returned.
 *
 * @param {chrome.tabs.Tab[]} tabs
 * @param {{ ignoreHash?: boolean, ignoreQuery?: boolean }} [options]
 * @returns {{ url: string, tabs: chrome.tabs.Tab[] }[]}
 */
export function findDuplicateGroups(tabs, { ignoreHash = true, ignoreQuery = false } = {}) {
  const groups = new Map();

  tabs.forEach((tab) => {
    if (!tab.url || !tab.id) return;
    if (!parseTabUrl(tab.url)) return;

    const key = normalizeUrl(tab.url, { ignoreHash, ignoreQuery });

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  });

  return [...groups.entries()]
    .filter(([, groupedTabs]) => groupedTabs.length > 1)
    .map(([url, groupedTabs]) => ({ url, tabs: groupedTabs }));
}

// --- Tab predicates ---

/**
 * Returns true when a tab can be safely auto-closed (not pinned, not active).
 *
 * @param {chrome.tabs.Tab} tab
 * @returns {boolean}
 */
export function isClosableTab(tab) {
  return Boolean(tab.id) && !tab.pinned && !tab.active;
}

/**
 * Picks the tab copy to keep when closing duplicates.
 * Prefers the active tab, then the pinned tab, then the first in the list.
 *
 * @param {chrome.tabs.Tab[]} tabs
 * @returns {chrome.tabs.Tab | null}
 */
export function selectPreferredTab(tabs) {
  if (tabs.length === 0) return null;
  return tabs.find((tab) => tab.active) || tabs.find((tab) => tab.pinned) || tabs[0];
}

// --- HTML utility ---

/**
 * Escapes dynamic text to keep popup rendering safe against injection.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

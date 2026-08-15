/**
 * AI-based tab categorisation: assignment cache, grouping, incremental split,
 * and merging of model results. Chrome-free (safe for popup, settings, and the
 * background service worker).
 */

import { CATEGORY_COLOURS, isNewTab, parseTabUrl } from './utils.js';
import { FALLBACK_CATEGORY } from './defaults.js';

const COLOUR_VALUES = new Set(CATEGORY_COLOURS.map((item) => item.value));
const MAX_CATEGORY_NAME_LENGTH = 32;

function validColour(colour) {
  return COLOUR_VALUES.has(colour) ? colour : 'grey';
}

/**
 * Stable cache key for a URL: origin + pathname, lowercased, `www.` stripped,
 * query string and hash dropped. Non-http(s) URLs return null.
 *
 * @param {string | undefined} url
 * @returns {string | null}
 */
export function assignmentKey(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    return `${parsed.protocol}//${hostname}${parsed.pathname.toLowerCase()}`;
  } catch {
    return null;
  }
}

/**
 * Groups tabs into a Map of category-name → tabs using saved AI memory.
 *
 *   - New-tab pages        → "New Tabs"
 *   - Assigned tabs        → their category name
 *   - Unassigned http(s)   → "Uncategorised"
 *   - Other internal pages → skipped
 *
 * @param {chrome.tabs.Tab[]} tabs
 * @param {import('./defaults.js').AiMemory} memory
 * @returns {Map<string, chrome.tabs.Tab[]>}
 */
export function groupTabsByAiMemory(tabs, memory) {
  const assignments = memory?.assignments ?? {};
  const result = new Map();
  result.set('New Tabs', []);
  for (const category of memory?.categories ?? []) {
    result.set(category.name, []);
  }
  result.set('Uncategorised', []);

  for (const tab of tabs) {
    if (isNewTab(tab.url)) {
      result.get('New Tabs').push(tab);
      continue;
    }

    const key = assignmentKey(tab.url);
    const assignment = key ? assignments[key] : null;

    if (key && assignment?.categoryName) {
      if (!result.has(assignment.categoryName)) result.set(assignment.categoryName, []);
      result.get(assignment.categoryName).push(tab);
    } else if (key) {
      result.get('Uncategorised').push(tab);
    }
  }

  return result;
}

/**
 * Splits tabs into those with a saved assignment (`known`), those without
 * (`unknown`), and those that should never be sent to the model (`skip`:
 * new-tab pages and non-http(s) internal pages).
 *
 * @param {chrome.tabs.Tab[]} tabs
 * @param {import('./defaults.js').AiMemory} memory
 * @returns {{ known: chrome.tabs.Tab[], unknown: chrome.tabs.Tab[], skip: chrome.tabs.Tab[] }}
 */
export function splitTabsForCategorize(tabs, memory) {
  const assignments = memory?.assignments ?? {};
  const known = [];
  const unknown = [];
  const skip = [];

  for (const tab of tabs) {
    if (isNewTab(tab.url)) {
      skip.push(tab);
      continue;
    }
    const key = assignmentKey(tab.url);
    if (!key) {
      skip.push(tab);
      continue;
    }
    if (assignments[key]) known.push(tab);
    else unknown.push(tab);
  }

  return { known, unknown, skip };
}

/**
 * Builds the payload sent to the model.
 *
 * @param {{ id: string, tab: chrome.tabs.Tab }[]} tabEntries
 * @param {import('./defaults.js').AiCategory[]} existingCategories
 * @returns {{ existingCategories: { name: string, colour: string }[], tabs: { id: string, title: string, host: string, path: string }[] }}
 */
export function buildCategorizePayload(tabEntries, existingCategories) {
  return {
    existingCategories: (existingCategories ?? []).map((category) => ({
      name: category.name,
      colour: category.colour,
    })),
    tabs: tabEntries.map(({ id, tab }) => {
      const parsed = parseTabUrl(tab.url);
      return {
        id,
        title: tab.title ?? '',
        host: parsed?.hostname ?? '',
        path: parsed?.pathname ?? '',
      };
    }),
  };
}

/**
 * Merges a successful model response into the current memory. Returns a new
 * memory object (assignments keyed by `assignmentKey`). Category names are
 * deduped case-insensitively (first spelling wins); unknown colours fall back
 * to grey; tabs without a valid assignment go to "Other".
 *
 * @param {import('./defaults.js').AiMemory} memory
 * @param {{ categories: { name: string, colour: string }[], assignments: { id: string, category: string }[] }} result
 * @param {{ id: string, tab: chrome.tabs.Tab }[]} tabEntries
 * @returns {import('./defaults.js').AiMemory}
 */
export function mergeCategorizeResult(memory, result, tabEntries) {
  const categories = [...(memory.categories ?? [])];
  const assignments = { ...(memory.assignments ?? {}) };
  const lowerByName = new Map(categories.map((category) => [category.name.toLowerCase(), category.name]));

  for (const raw of result.categories ?? []) {
    const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, MAX_CATEGORY_NAME_LENGTH) : '';
    if (!name) continue;
    const colour = validColour(raw?.colour);

    const existingName = lowerByName.get(name.toLowerCase());
    if (existingName) {
      const index = categories.findIndex((category) => category.name === existingName);
      if (index !== -1) categories[index] = { ...categories[index], colour };
    } else {
      categories.push({ name, colour });
      lowerByName.set(name.toLowerCase(), name);
    }
  }

  if (!lowerByName.has(FALLBACK_CATEGORY.name.toLowerCase())) {
    categories.push({ ...FALLBACK_CATEGORY });
    lowerByName.set(FALLBACK_CATEGORY.name.toLowerCase(), FALLBACK_CATEGORY.name);
  }

  const now = Date.now();
  for (const entry of tabEntries) {
    const key = assignmentKey(entry.tab.url);
    if (!key) continue;

    const modelAssignment = (result.assignments ?? []).find(
      (item) => item?.id !== undefined && String(item.id) === String(entry.id)
    );
    const rawName = typeof modelAssignment?.category === 'string' ? modelAssignment.category.trim() : '';
    const categoryName = lowerByName.get(rawName.toLowerCase()) ?? FALLBACK_CATEGORY.name;
    const colour = categories.find((category) => category.name === categoryName)?.colour ?? FALLBACK_CATEGORY.colour;

    assignments[key] = { categoryName, colour, assignedAt: now };
  }

  return { categories, assignments };
}

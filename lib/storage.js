/**
 * Storage abstraction for TabMate.
 *
 * Layout:
 *   chrome.storage.sync  — settings, customCategories  (small; syncs across devices)
 *   chrome.storage.local — boards, savedTabs, lastClosedTabs  (potentially larger)
 *
 * All UI code should import from this module rather than calling chrome.storage directly.
 */

import { DEFAULT_CATEGORIES, DEFAULT_BOARDS, DEFAULT_SETTINGS } from './defaults.js';

// --- low-level helpers ---

function syncGet(keys) {
  return chrome.storage.sync.get(keys);
}

function syncSet(items) {
  return chrome.storage.sync.set(items);
}

function localGet(keys) {
  return chrome.storage.local.get(keys);
}

function localSet(items) {
  return chrome.storage.local.set(items);
}

function localRemove(keys) {
  return chrome.storage.local.remove(keys);
}

// --- settings ---

/** @returns {Promise<import('./defaults.js').Settings>} */
export async function getSettings() {
  const result = await syncGet(['settings']);
  return result.settings ?? { ...DEFAULT_SETTINGS };
}

/** @param {import('./defaults.js').Settings} settings */
export async function setSettings(settings) {
  await syncSet({ settings });
}

// --- categories ---

/** @returns {Promise<import('./defaults.js').Category[]>} */
export async function getCategories() {
  const result = await syncGet(['customCategories']);
  return result.customCategories ?? [...DEFAULT_CATEGORIES];
}

/** @param {import('./defaults.js').Category[]} categories */
export async function setCategories(categories) {
  await syncSet({ customCategories: categories });
}

// --- boards ---

/** @returns {Promise<import('./defaults.js').Board[]>} */
export async function getBoards() {
  const result = await localGet(['boards']);
  return result.boards ?? [...DEFAULT_BOARDS];
}

/** @param {import('./defaults.js').Board[]} boards */
export async function setBoards(boards) {
  await localSet({ boards });
}

// --- saved tabs (tabs saved by the user to a board) ---

/** @returns {Promise<import('./defaults.js').SavedTab[]>} */
export async function getSavedTabs() {
  const result = await localGet(['savedTabs']);
  return result.savedTabs ?? [];
}

/** @param {import('./defaults.js').SavedTab[]} tabs */
export async function setSavedTabs(tabs) {
  await localSet({ savedTabs: tabs });
}

// --- undo state (last batch of closed tabs) ---

/** @returns {Promise<{ title: string, url: string }[]>} */
export async function getUndoTabs() {
  const result = await localGet(['lastClosedTabs']);
  return Array.isArray(result.lastClosedTabs) ? result.lastClosedTabs : [];
}

/** @param {{ title: string, url: string }[]} tabs */
export async function setUndoTabs(tabs) {
  await localSet({ lastClosedTabs: tabs });
}

export async function clearUndoTabs() {
  await localRemove(['lastClosedTabs']);
}

// --- initialisation ---

/**
 * Seeds default data on first install.
 * Safe to call on every startup: only writes keys that are absent from storage.
 */
export async function initDefaults() {
  const [syncData, localData] = await Promise.all([
    syncGet(['settings', 'customCategories']),
    localGet(['boards']),
  ]);

  const syncUpdates = {};
  const localUpdates = {};

  if (!syncData.settings) syncUpdates.settings = { ...DEFAULT_SETTINGS };
  if (!syncData.customCategories) syncUpdates.customCategories = [...DEFAULT_CATEGORIES];
  if (!localData.boards) localUpdates.boards = [...DEFAULT_BOARDS];

  await Promise.all([
    Object.keys(syncUpdates).length ? syncSet(syncUpdates) : Promise.resolve(),
    Object.keys(localUpdates).length ? localSet(localUpdates) : Promise.resolve(),
  ]);
}

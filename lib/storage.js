/**
 * Storage abstraction for TabMate.
 *
 * Layout:
 *   chrome.storage.sync  — settings, customCategories  (small; syncs across devices)
 *   chrome.storage.local — presets, boards, savedTabs, lastClosedTabs
 *
 * All UI code should import from this module rather than calling chrome.storage directly.
 */

import {
  DEFAULT_CATEGORIES,
  DEFAULT_BOARDS,
  DEFAULT_PRESETS,
  DEFAULT_SETTINGS,
} from './defaults.js';

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

function cloneSettings() {
  return {
    ...DEFAULT_SETTINGS,
    notifications: { ...DEFAULT_SETTINGS.notifications },
    duplicateDetection: { ...DEFAULT_SETTINGS.duplicateDetection },
    keyboardShortcuts: { ...DEFAULT_SETTINGS.keyboardShortcuts },
  };
}

function mergeSettings(settings) {
  return {
    ...cloneSettings(),
    ...(settings ?? {}),
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...(settings?.notifications ?? {}),
    },
    duplicateDetection: {
      ...DEFAULT_SETTINGS.duplicateDetection,
      ...(settings?.duplicateDetection ?? {}),
    },
    keyboardShortcuts: {
      ...DEFAULT_SETTINGS.keyboardShortcuts,
      ...(settings?.keyboardShortcuts ?? {}),
    },
  };
}

function cloneBoard(board) {
  return {
    ...board,
    tabs: Array.isArray(board.tabs) ? board.tabs.map((tab) => ({ ...tab })) : [],
  };
}

function normalizeCategory(category) {
  const defaultCategory = DEFAULT_CATEGORIES.find((item) => item.id === category.id);

  return {
    ...category,
    colour: category.colour ?? defaultCategory?.colour ?? 'grey',
    priority: category.priority ?? defaultCategory?.priority ?? 500,
    rules: Array.isArray(category.rules)
      ? category.rules.map((rule) => ({ ...rule }))
      : (defaultCategory?.rules ?? []).map((rule) => ({ ...rule })),
    undeletable:
      category.id === 'other'
        ? true
        : (category.undeletable ?? defaultCategory?.undeletable ?? false),
  };
}

function sanitizePresetTab(tab) {
  const url = typeof tab?.url === 'string' ? tab.url.trim() : '';
  return {
    ...(typeof tab?.title === 'string' && tab.title.trim() ? { title: tab.title.trim() } : {}),
    url,
  };
}

function normalizePreset(preset) {
  return {
    id: preset.id,
    name: preset.name ?? 'Untitled preset',
    ...(preset.description ? { description: preset.description } : {}),
    tabs: Array.isArray(preset.tabs)
      ? preset.tabs
          .map(sanitizePresetTab)
          .filter((tab) => Boolean(tab.url))
      : [],
    openBehavior:
      preset.openBehavior === 'replaceCurrentTabs' ? 'replaceCurrentTabs' : 'addToCurrentTabs',
    ...(preset.category ? { category: preset.category } : {}),
    ...(preset.keyboardShortcut ? { keyboardShortcut: preset.keyboardShortcut } : {}),
  };
}

function migrateBoardsToPresets(boards) {
  if (!Array.isArray(boards)) return DEFAULT_PRESETS.map((preset) => normalizePreset(preset));

  return boards
    .filter((board) => !board.undeletable && Array.isArray(board.tabs) && board.tabs.length > 0)
    .map((board, index) => {
      const boardId =
        typeof board.id === 'string' && board.id.trim() ? board.id.trim() : `imported_${index + 1}`;

      return normalizePreset({
        id: `preset_${boardId}`,
        name: board.name ?? 'Imported preset',
        description: 'Imported from saved boards',
        tabs: board.tabs.map((tab) => ({
          title: tab.title,
          url: tab.url,
        })),
        openBehavior: 'addToCurrentTabs',
      });
    });
}

/** @returns {Promise<import('./defaults.js').Settings>} */
export async function getSettings() {
  const result = await syncGet(['settings']);
  return mergeSettings(result.settings);
}

/** @param {import('./defaults.js').Settings} settings */
export async function setSettings(settings) {
  await syncSet({ settings: mergeSettings(settings) });
}

/** @returns {Promise<import('./defaults.js').Category[]>} */
export async function getCategories() {
  const result = await syncGet(['customCategories']);
  const stored = result.customCategories;

  if (!Array.isArray(stored)) {
    return DEFAULT_CATEGORIES.map((category) => normalizeCategory(category));
  }

  return stored.map((category) => normalizeCategory(category));
}

/** @param {import('./defaults.js').Category[]} categories */
export async function setCategories(categories) {
  await syncSet({ customCategories: categories.map((category) => normalizeCategory(category)) });
}

/** @returns {Promise<import('./defaults.js').Preset[]>} */
export async function getPresets() {
  const result = await localGet(['presets', 'boards']);

  if (Array.isArray(result.presets)) {
    return result.presets.map((preset) => normalizePreset(preset));
  }

  const migrated = migrateBoardsToPresets(result.boards);
  await localSet({ presets: migrated });
  return migrated;
}

/** @param {import('./defaults.js').Preset[]} presets */
export async function setPresets(presets) {
  await localSet({ presets: presets.map((preset) => normalizePreset(preset)) });
}

/** @returns {Promise<import('./defaults.js').Board[]>} */
export async function getBoards() {
  const result = await localGet(['boards']);
  return Array.isArray(result.boards)
    ? result.boards.map((board) => cloneBoard(board))
    : DEFAULT_BOARDS.map((board) => cloneBoard(board));
}

/** @param {import('./defaults.js').Board[]} boards */
export async function setBoards(boards) {
  await localSet({ boards: boards.map((board) => cloneBoard(board)) });
}

/** @returns {Promise<import('./defaults.js').SavedTab[]>} */
export async function getSavedTabs() {
  const result = await localGet(['savedTabs']);
  return Array.isArray(result.savedTabs) ? result.savedTabs.map((tab) => ({ ...tab })) : [];
}

/** @param {import('./defaults.js').SavedTab[]} tabs */
export async function setSavedTabs(tabs) {
  await localSet({ savedTabs: tabs.map((tab) => ({ ...tab })) });
}

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

/**
 * Seeds default data on first install.
 * Safe to call on every startup: only writes keys that are absent from storage.
 */
export async function initDefaults() {
  const [syncData, localData] = await Promise.all([
    syncGet(['settings', 'customCategories']),
    localGet(['boards', 'presets']),
  ]);

  const syncUpdates = {};
  const localUpdates = {};

  if (!syncData.settings) syncUpdates.settings = cloneSettings();
  if (!syncData.customCategories) {
    syncUpdates.customCategories = DEFAULT_CATEGORIES.map((category) => normalizeCategory(category));
  }
  if (!localData.boards) {
    localUpdates.boards = DEFAULT_BOARDS.map((board) => cloneBoard(board));
  }
  if (!localData.presets) {
    localUpdates.presets = migrateBoardsToPresets(localData.boards);
  }

  await Promise.all([
    Object.keys(syncUpdates).length > 0 ? syncSet(syncUpdates) : Promise.resolve(),
    Object.keys(localUpdates).length > 0 ? localSet(localUpdates) : Promise.resolve(),
  ]);
}

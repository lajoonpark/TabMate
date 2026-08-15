/**
 * Storage abstraction for TabMate.
 *
 * Layout:
 *   chrome.storage.sync  — settings  (small; syncs across devices)
 *   chrome.storage.local — presets, boards, savedTabs, lastClosedTabs,
 *                          aiConfig, aiMemory  (API key + memory, local only)
 *
 * All UI code should import from this module rather than calling chrome.storage directly.
 */

import {
  DEFAULT_AI_CONFIG,
  DEFAULT_BOARDS,
  DEFAULT_PRESETS,
  DEFAULT_SETTINGS,
} from './defaults.js';
import { CATEGORY_COLOURS } from './utils.js';

const COLOUR_VALUES = new Set(CATEGORY_COLOURS.map((item) => item.value));

function validColour(colour) {
  return COLOUR_VALUES.has(colour) ? colour : 'grey';
}

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
    popupNotifications: { ...DEFAULT_SETTINGS.popupNotifications },
    duplicateDetection: { ...DEFAULT_SETTINGS.duplicateDetection },
    keyboardShortcuts: { ...DEFAULT_SETTINGS.keyboardShortcuts },
    shortcutSlots: { ...DEFAULT_SETTINGS.shortcutSlots },
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
    popupNotifications: {
      ...DEFAULT_SETTINGS.popupNotifications,
      ...(settings?.popupNotifications ?? {}),
    },
    duplicateDetection: {
      ...DEFAULT_SETTINGS.duplicateDetection,
      ...(settings?.duplicateDetection ?? {}),
    },
    keyboardShortcuts: {
      ...DEFAULT_SETTINGS.keyboardShortcuts,
      ...(settings?.keyboardShortcuts ?? {}),
    },
    shortcutSlots: {
      ...DEFAULT_SETTINGS.shortcutSlots,
      ...(settings?.shortcutSlots ?? {}),
    },
  };
}

function cloneBoard(board) {
  return {
    id: board.id,
    name: board.name ?? 'Untitled board',
    ...(board.description ? { description: board.description } : {}),
    createdAt: board.createdAt ?? 0,
    updatedAt: board.updatedAt ?? 0,
    isSystem: board.isSystem ?? false,
    isDefault: board.isDefault ?? false,
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

/** @returns {Promise<import('./defaults.js').AiConfig>} */
export async function getAiConfig() {
  const result = await localGet(['aiConfig']);
  return {
    apiKey: typeof result.aiConfig?.apiKey === 'string' ? result.aiConfig.apiKey : '',
    model:
      typeof result.aiConfig?.model === 'string' && result.aiConfig.model
        ? result.aiConfig.model
        : DEFAULT_AI_CONFIG.model,
    customModel: typeof result.aiConfig?.customModel === 'string' ? result.aiConfig.customModel : '',
    lastError: typeof result.aiConfig?.lastError === 'string' ? result.aiConfig.lastError : '',
    lastRunAt: typeof result.aiConfig?.lastRunAt === 'number' ? result.aiConfig.lastRunAt : 0,
  };
}

/** @param {import('./defaults.js').AiConfig} config */
export async function setAiConfig(config) {
  await localSet({
    aiConfig: {
      apiKey: typeof config?.apiKey === 'string' ? config.apiKey : '',
      model:
        typeof config?.model === 'string' && config.model
          ? config.model
          : DEFAULT_AI_CONFIG.model,
      customModel: typeof config?.customModel === 'string' ? config.customModel : '',
      lastError: typeof config?.lastError === 'string' ? config.lastError : '',
      lastRunAt: typeof config?.lastRunAt === 'number' ? config.lastRunAt : 0,
    },
  });
}

function cloneAiMemory(memory) {
  return {
    categories: Array.isArray(memory?.categories)
      ? memory.categories
          .filter((category) => typeof category?.name === 'string' && category.name.trim() !== '')
          .map((category) => ({
            name: category.name.trim(),
            colour: validColour(category.colour),
          }))
      : [],
    assignments:
      memory?.assignments && typeof memory.assignments === 'object' && !Array.isArray(memory.assignments)
        ? Object.fromEntries(
            Object.entries(memory.assignments)
              .filter(([key]) => typeof key === 'string' && key !== '')
              .map(([key, assignment]) => [
                key,
                {
                  categoryName:
                    typeof assignment?.categoryName === 'string'
                      ? assignment.categoryName
                      : 'Other',
                  colour: validColour(assignment?.colour),
                  assignedAt: typeof assignment?.assignedAt === 'number' ? assignment.assignedAt : 0,
                },
              ])
          )
        : {},
  };
}

/** @returns {Promise<import('./defaults.js').AiMemory>} */
export async function getAiMemory() {
  const result = await localGet(['aiMemory']);
  return cloneAiMemory(result.aiMemory);
}

/** @param {import('./defaults.js').AiMemory} memory */
export async function setAiMemory(memory) {
  await localSet({ aiMemory: cloneAiMemory(memory) });
}

/** Wipes site→category assignments but keeps the learned category vocabulary. */
export async function clearAiAssignments() {
  const memory = await getAiMemory();
  memory.assignments = {};
  await setAiMemory(memory);
}

/** Wipes assignments and learned categories (Recategorize all). */
export async function resetAiMemory() {
  await localRemove(['aiMemory']);
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
  return Array.isArray(result.savedTabs)
    ? result.savedTabs.map((tab) => ({
        id: tab.id,
        boardId: tab.boardId,
        title: tab.title ?? 'Untitled',
        url: tab.url,
        ...(tab.faviconUrl ? { faviconUrl: tab.faviconUrl } : {}),
        savedAt: tab.savedAt ?? 0,
        ...(tab.note ? { note: tab.note } : {}),
        ...(Array.isArray(tab.tags) && tab.tags.length > 0 ? { tags: tab.tags } : {}),
      }))
    : [];
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
 * Saves a tab to a board. Returns { ok, duplicate } where duplicate is truthy
 * when the exact same URL already exists in the same board.
 *
 * @param {{ title: string, url: string, faviconUrl?: string }} tab
 * @param {string} boardId
 * @returns {Promise<{ ok: boolean, duplicate: boolean, savedTab?: import('./defaults.js').SavedTab }>}
 */
export async function saveTabToBoard(tab, boardId) {
  const [boards, savedTabs] = await Promise.all([getBoards(), getSavedTabs()]);
  const board = boards.find((b) => b.id === boardId);
  if (!board) return { ok: false, duplicate: false };

  const isDuplicate = savedTabs.some((t) => t.boardId === boardId && t.url === tab.url);
  if (isDuplicate) return { ok: false, duplicate: true };

  const now = Date.now();
  const savedTab = {
    id: `stab_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    boardId,
    title: tab.title || 'Untitled',
    url: tab.url,
    ...(tab.faviconUrl ? { faviconUrl: tab.faviconUrl } : {}),
    savedAt: now,
  };

  savedTabs.push(savedTab);
  board.updatedAt = now;

  await Promise.all([setSavedTabs(savedTabs), setBoards(boards)]);
  return { ok: true, duplicate: false, savedTab };
}

/**
 * Seeds default data on first install.
 * Safe to call on every startup: only writes keys that are absent from storage.
 */
export async function initDefaults() {
  const [syncData, localData] = await Promise.all([
    syncGet(['settings']),
    localGet(['boards', 'presets', 'savedTabs']),
  ]);

  const syncUpdates = {};
  const localUpdates = {};

  if (!syncData.settings) syncUpdates.settings = cloneSettings();
  if (!localData.boards) {
    localUpdates.boards = DEFAULT_BOARDS.map((board) => cloneBoard(board));
  }
  if (!localData.presets) {
    localUpdates.presets = migrateBoardsToPresets(localData.boards);
  }
  if (!localData.savedTabs) {
    localUpdates.savedTabs = [];
  }

  await Promise.all([
    Object.keys(syncUpdates).length > 0 ? syncSet(syncUpdates) : Promise.resolve(),
    Object.keys(localUpdates).length > 0 ? localSet(localUpdates) : Promise.resolve(),
  ]);
}

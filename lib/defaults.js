/**
 * AI categorization config (stored in chrome.storage.local — never sync).
 *
 * @typedef {{
 *   apiKey: string,
 *   model: string,
 *   customModel: string,
 *   lastError: string,
 *   lastRunAt: number
 * }} AiConfig
 */
export const DEFAULT_AI_CONFIG = {
  apiKey: '',
  model: 'google/gemini-2.5-flash',
  customModel: '',
  lastError: '',
  lastRunAt: 0,
};

/**
 * Curated model list shown in the settings model dropdown. The list can be
 * refreshed from OpenRouter's model catalogue; "custom" always stays available.
 *
 * @type {{ id: string, label: string }[]}
 */
export const AI_MODELS = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (default, cheap)' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
  { id: 'anthropic/claude-3.5-haiku', label: 'Claude Haiku' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
];

/**
 * Fallback category used for anything the model does not assign.
 *
 * @type {{ name: string, colour: string }}
 */
export const FALLBACK_CATEGORY = { name: 'Other', colour: 'grey' };

/**
 * AI learned state, stored under the `aiMemory` key in chrome.storage.local.
 *
 * @typedef {{ name: string, colour: string }} AiCategory
 * @typedef {{
 *   categoryName: string,
 *   colour: string,
 *   assignedAt: number
 * }} AiAssignment
 * @typedef {{
 *   categories: AiCategory[],
 *   assignments: Record<string, AiAssignment>
 * }} AiMemory
 */

/**
 * Board model used for saving and organising tabs, similar to Pinterest boards.
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description?: string,
 *   createdAt: number,
 *   updatedAt: number,
 *   isSystem: boolean,
 *   isDefault: boolean
 * }} Board
 *
 * Saved tab model — each saved tab belongs to exactly one board.
 *
 * @typedef {{
 *   id: string,
 *   boardId: string,
 *   title: string,
 *   url: string,
 *   faviconUrl?: string,
 *   savedAt: number,
 *   note?: string,
 *   tags?: string[]
 * }} SavedTab
 */
export const DEFAULT_BOARDS = [
  {
    id: 'unorganised',
    name: 'Unorganised',
    description: 'Default board for saved tabs.',
    createdAt: 0,
    updatedAt: 0,
    isSystem: true,
    isDefault: true,
  },
];

/**
 * Preset model used for reopening curated tab sets.
 *
 * @typedef {{ title?: string, url: string }} PresetTab
 * @typedef {'addToCurrentTabs'|'replaceCurrentTabs'} PresetOpenBehavior
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description?: string,
 *   tabs: PresetTab[],
 *   openBehavior: PresetOpenBehavior,
 *   category?: string,
 *   keyboardShortcut?: string
 * }} Preset
 */
export const DEFAULT_PRESETS = [];

/**
 * Default application settings.
 *
 * @typedef {{ enabled: boolean, showOnClose: boolean }} NotificationSettings
 * @typedef {{
 *   enabled: boolean,
 *   position: 'bottom-left'|'bottom-right'|'top-left'|'top-right',
 *   newTabsEnabled: boolean,
 *   newTabsThreshold: number,
 *   duplicatesEnabled: boolean,
 *   duplicatesThreshold: number,
 *   manyTabsEnabled: boolean,
 *   manyTabsThreshold: number,
 *   saveConfirmEnabled: boolean
 * }} PopupNotificationSettings
 * @typedef {{
 *   enabled: boolean,
 *   mode: 'exact' | 'generalized',
 *   ignoreHash: boolean,
 *   ignoreQuery: boolean,
 *   closePinnedTabs: boolean
 * }} DuplicateDetectionSettings
 * @typedef {{ closeDuplicates: string, openPopup: string, undo: string }} KeyboardShortcuts
 * @typedef {{
 *   confirmationThreshold: number,
 *   showDuplicates: boolean,
 *   defaultBoardId: string,
 *   notifications: NotificationSettings,
 *   popupNotifications: PopupNotificationSettings,
 *   duplicateDetection: DuplicateDetectionSettings,
 *   keyboardShortcuts: KeyboardShortcuts,
 *   shortcutSlots: { presetSlot1?: string, boardSlot1?: string, boardSlot2?: string, boardSlot3?: string }
 * }} Settings
 */
export const DEFAULT_SETTINGS = {
  confirmationThreshold: 5,
  showDuplicates: true,
  defaultBoardId: 'unorganised',
  notifications: {
    enabled: true,
    showOnClose: true,
  },
  popupNotifications: {
    enabled: true,
    position: 'bottom-left',
    newTabsEnabled: true,
    newTabsThreshold: 8,
    duplicatesEnabled: true,
    duplicatesThreshold: 3,
    manyTabsEnabled: true,
    manyTabsThreshold: 25,
    saveConfirmEnabled: true,
  },
  duplicateDetection: {
    enabled: true,
    mode: 'exact',
    ignoreHash: true,
    ignoreQuery: false,
    closePinnedTabs: false,
  },
  keyboardShortcuts: {
    closeDuplicates: '',
    openPopup: '',
    undo: '',
  },
  shortcutSlots: {
    presetSlot1: '',
    boardSlot1: '',
    boardSlot2: '',
    boardSlot3: '',
  },
};

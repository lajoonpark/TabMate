/**
 * Default named categories available out of the box.
 * Each category has an `id` (stable key), a `name` (display label),
 * and `builtin: true` to distinguish defaults from user-created ones.
 *
 * @typedef {{ id: string, name: string, builtin: boolean }} Category
 */
export const DEFAULT_CATEGORIES = [
  { id: 'school', name: 'School', builtin: true },
  { id: 'work', name: 'Work', builtin: true },
  { id: 'shopping', name: 'Shopping', builtin: true },
  { id: 'entertainment', name: 'Entertainment', builtin: true },
  { id: 'social', name: 'Social', builtin: true },
  { id: 'research', name: 'Research', builtin: true },
  { id: 'coding', name: 'Coding', builtin: true },
  { id: 'other', name: 'Other', builtin: true },
];

/**
 * Default boards. The "Unorganised" board is undeletable and is the initial
 * default target for saved tabs. Users may designate a different default later.
 *
 * @typedef {{ id: string, name: string, tabs: SavedTab[], undeletable: boolean, isDefault: boolean }} Board
 * @typedef {{ title: string, url: string, savedAt: number }} SavedTab
 */
export const DEFAULT_BOARDS = [
  {
    id: 'unorganised',
    name: 'Unorganised',
    tabs: [],
    undeletable: true,
    isDefault: true,
  },
];

/**
 * Default application settings.
 *
 * @typedef {{ enabled: boolean, showOnClose: boolean }} NotificationSettings
 * @typedef {{ enabled: boolean, ignoreHash: boolean, ignoreQuery: boolean }} DuplicateDetectionSettings
 * @typedef {{ closeDuplicates: string, openPopup: string, undo: string }} KeyboardShortcuts
 * @typedef {{
 *   confirmationThreshold: number,
 *   showDuplicates: boolean,
 *   defaultBoardId: string,
 *   notifications: NotificationSettings,
 *   duplicateDetection: DuplicateDetectionSettings,
 *   keyboardShortcuts: KeyboardShortcuts
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
  duplicateDetection: {
    enabled: true,
    ignoreHash: true,
    ignoreQuery: false,
  },
  keyboardShortcuts: {
    closeDuplicates: '',
    openPopup: '',
    undo: '',
  },
};

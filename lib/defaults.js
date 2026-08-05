/**
 * Default named categories available out of the box.
 *
 * Each category has:
 *   id          — stable storage key
 *   name        — display label
 *   colour      — Chrome tabGroups colour token
 *   builtin     — true for shipped defaults
 *   undeletable — true for categories that can never be removed (i.e. "Other")
 *   priority    — lower = matched first; "Other" is always the fallback (999)
 *   rules       — ordered list of matching rules; each rule has `type` and `value`
 *
 * Rule types:
 *   exactDomain    — hostname exactly equals value (www stripped)
 *   domainContains — hostname contains value or is a subdomain of it
 *   urlContains    — full URL string contains value
 *   titleContains  — page title contains value (case-insensitive)
 *
 * @typedef {'exactDomain'|'domainContains'|'urlContains'|'titleContains'} RuleType
 * @typedef {{ type: RuleType, value: string }} CategoryRule
 * @typedef {{
 *   id: string,
 *   name: string,
 *   colour: string,
 *   builtin: boolean,
 *   undeletable?: boolean,
 *   priority: number,
 *   rules: CategoryRule[]
 * }} Category
 */
export const DEFAULT_CATEGORIES = [
  {
    id: 'work',
    name: 'Work',
    colour: 'blue',
    builtin: true,
    priority: 10,
    rules: [
      { type: 'domainContains', value: 'slack.com' },
      { type: 'domainContains', value: 'teams.microsoft.com' },
      { type: 'domainContains', value: 'office.com' },
      { type: 'domainContains', value: 'sharepoint.com' },
      { type: 'domainContains', value: 'onedrive.live.com' },
      { type: 'domainContains', value: 'mail.google.com' },
      { type: 'domainContains', value: 'calendar.google.com' },
      { type: 'domainContains', value: 'meet.google.com' },
      { type: 'domainContains', value: 'zoom.us' },
      { type: 'domainContains', value: 'notion.so' },
      { type: 'domainContains', value: 'atlassian.net' },
      { type: 'domainContains', value: 'trello.com' },
      { type: 'domainContains', value: 'asana.com' },
      { type: 'domainContains', value: 'linear.app' },
      { type: 'domainContains', value: 'monday.com' },
    ],
  },
  {
    id: 'school',
    name: 'School',
    colour: 'cyan',
    builtin: true,
    priority: 20,
    rules: [
      { type: 'domainContains', value: 'instructure.com' },
      { type: 'domainContains', value: 'blackboard.com' },
      { type: 'domainContains', value: 'schoology.com' },
      { type: 'urlContains', value: 'classroom.google.com' },
      { type: 'domainContains', value: 'moodle' },
      { type: 'domainContains', value: '.edu' },
      { type: 'domainContains', value: '.ac.uk' },
      { type: 'domainContains', value: '.ac.nz' },
    ],
  },
  {
    id: 'coding',
    name: 'Coding',
    colour: 'green',
    builtin: true,
    priority: 30,
    rules: [
      { type: 'domainContains', value: 'github.com' },
      { type: 'domainContains', value: 'stackoverflow.com' },
      { type: 'domainContains', value: 'gitlab.com' },
      { type: 'domainContains', value: 'bitbucket.org' },
      { type: 'domainContains', value: 'vercel.com' },
      { type: 'domainContains', value: 'netlify.com' },
      { type: 'domainContains', value: 'supabase.com' },
      { type: 'domainContains', value: 'heroku.com' },
      { type: 'domainContains', value: 'replit.com' },
      { type: 'domainContains', value: 'codepen.io' },
      { type: 'domainContains', value: 'codesandbox.io' },
      { type: 'domainContains', value: 'npmjs.com' },
      { type: 'domainContains', value: 'developer.mozilla.org' },
    ],
  },
  {
    id: 'shopping',
    name: 'Shopping',
    colour: 'yellow',
    builtin: true,
    priority: 40,
    rules: [
      { type: 'domainContains', value: 'amazon' },
      { type: 'domainContains', value: 'ebay.com' },
      { type: 'domainContains', value: 'trademe.co.nz' },
      { type: 'domainContains', value: 'etsy.com' },
      { type: 'domainContains', value: 'aliexpress.com' },
      { type: 'domainContains', value: 'walmart.com' },
      { type: 'domainContains', value: 'target.com' },
      { type: 'domainContains', value: 'bestbuy.com' },
    ],
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    colour: 'orange',
    builtin: true,
    priority: 50,
    rules: [
      { type: 'domainContains', value: 'youtube.com' },
      { type: 'domainContains', value: 'netflix.com' },
      { type: 'domainContains', value: 'spotify.com' },
      { type: 'domainContains', value: 'twitch.tv' },
      { type: 'domainContains', value: 'disneyplus.com' },
      { type: 'domainContains', value: 'hulu.com' },
      { type: 'domainContains', value: 'primevideo.com' },
      { type: 'domainContains', value: 'soundcloud.com' },
      { type: 'domainContains', value: 'crunchyroll.com' },
      { type: 'domainContains', value: 'tiktok.com' },
    ],
  },
  {
    id: 'social',
    name: 'Social',
    colour: 'pink',
    builtin: true,
    priority: 60,
    rules: [
      { type: 'domainContains', value: 'facebook.com' },
      { type: 'domainContains', value: 'instagram.com' },
      { type: 'domainContains', value: 'twitter.com' },
      { type: 'domainContains', value: 'x.com' },
      { type: 'domainContains', value: 'reddit.com' },
      { type: 'domainContains', value: 'linkedin.com' },
      { type: 'domainContains', value: 'discord.com' },
      { type: 'domainContains', value: 'snapchat.com' },
      { type: 'domainContains', value: 'pinterest.com' },
      { type: 'domainContains', value: 'tumblr.com' },
    ],
  },
  {
    id: 'research',
    name: 'Research',
    colour: 'purple',
    builtin: true,
    priority: 70,
    rules: [
      { type: 'domainContains', value: 'wikipedia.org' },
      { type: 'domainContains', value: 'scholar.google.com' },
      { type: 'domainContains', value: 'semanticscholar.org' },
      { type: 'domainContains', value: 'jstor.org' },
      { type: 'domainContains', value: 'medium.com' },
      { type: 'domainContains', value: 'substack.com' },
      { type: 'urlContains', value: 'google.com/search' },
      { type: 'urlContains', value: 'bing.com/search' },
      { type: 'domainContains', value: 'duckduckgo.com' },
    ],
  },
  {
    id: 'other',
    name: 'Other',
    colour: 'grey',
    builtin: true,
    undeletable: true,
    priority: 999,
    rules: [],
  },
];

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

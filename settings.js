import {
  getCategories,
  setCategories,
  getPresets,
  setPresets,
  getSettings,
  setSettings,
  getBoards,
  setBoards,
  getSavedTabs,
  setSavedTabs,
} from './lib/storage.js';
import {
  CATEGORY_COLOURS,
  matchTabToCategory,
  escapeHtml,
  isInternalUrl,
} from './lib/utils.js';

/** @type {import('./lib/defaults.js').Category[]} */
let categories = [];
/** @type {import('./lib/defaults.js').Preset[]} */
let presets = [];
/** @type {import('./lib/defaults.js').Settings | null} */
let userSettings = null;
/** @type {import('./lib/defaults.js').Board[]} */
let boards = [];
/** @type {import('./lib/defaults.js').SavedTab[]} */
let savedTabs = [];
/** Currently open board id for the tabs view, or null */
let openBoardId = null;

let editingId = null;
let draftRules = [];
let editingPresetId = null;
let draftPresetTabs = [];
let editingBoardId = null;

const navItems = Array.from(document.querySelectorAll('.sidebar__nav-item'));

const categoryListEl = document.getElementById('category-list');
const editorEl = document.getElementById('category-editor');
const editorTitleEl = document.getElementById('editor-title');
const editorNameEl = document.getElementById('editor-name');
const colourPickerEl = document.getElementById('colour-picker');
const rulesListEl = document.getElementById('rules-list');
const rulesEmptyEl = document.getElementById('rules-empty');
const btnAddCategory = document.getElementById('btn-add-category');
const btnAddRule = document.getElementById('btn-add-rule');
const btnSaveCategory = document.getElementById('btn-save-category');
const btnCancelEditor = document.getElementById('btn-cancel-editor');
const previewUrlEl = document.getElementById('preview-url');
const previewTitleEl = document.getElementById('preview-title');
const btnPreview = document.getElementById('btn-preview');
const previewResultEl = document.getElementById('preview-result');
const previewDotEl = document.getElementById('preview-dot');
const previewMatchEl = document.getElementById('preview-match');

const presetListEl = document.getElementById('preset-list');
const presetEditorEl = document.getElementById('preset-editor');
const presetEditorTitleEl = document.getElementById('preset-editor-title');
const presetNameEl = document.getElementById('preset-name');
const presetDescriptionEl = document.getElementById('preset-description');
const presetOpenBehaviorEl = document.getElementById('preset-open-behavior');
const presetCategoryEl = document.getElementById('preset-category');
const presetShortcutEl = document.getElementById('preset-shortcut');
const presetTabsListEl = document.getElementById('preset-tabs-list');
const presetTabsEmptyEl = document.getElementById('preset-tabs-empty');
const btnAddPreset = document.getElementById('btn-add-preset');
const btnAddPresetTab = document.getElementById('btn-add-preset-tab');
const btnImportCurrentTabs = document.getElementById('btn-import-current-tabs');
const btnSavePreset = document.getElementById('btn-save-preset');
const btnCancelPreset = document.getElementById('btn-cancel-preset');

const duplicateModeInputs = Array.from(document.querySelectorAll('input[name="duplicate-mode"]'));
const duplicateSettingsStatusEl = document.getElementById('duplicate-settings-status');

// ─── Boards elements ──────────────────────────────────────────────────────────
const boardListEl = document.getElementById('board-list');
const boardEditorEl = document.getElementById('board-editor');
const boardEditorTitleEl = document.getElementById('board-editor-title');
const boardNameEl = document.getElementById('board-name');
const boardDescriptionEl = document.getElementById('board-description');
const btnAddBoard = document.getElementById('btn-add-board');
const btnSaveBoard = document.getElementById('btn-save-board');
const btnCancelBoard = document.getElementById('btn-cancel-board');

const boardTabsViewEl = document.getElementById('board-tabs-view');
const boardTabsTitleEl = document.getElementById('board-tabs-title');
const boardTabsListEl = document.getElementById('board-tabs-list');
const btnBackBoards = document.getElementById('btn-back-boards');
const btnSelectAllTabs = document.getElementById('btn-select-all-tabs');
const btnDeselectAllTabs = document.getElementById('btn-deselect-all-tabs');
const btnOpenSelectedTabs = document.getElementById('btn-open-selected-tabs');
const btnOpenAllTabs = document.getElementById('btn-open-all-tabs');
const btnMoveSelectedTabs = document.getElementById('btn-move-selected-tabs');
const btnDeleteSelectedTabs = document.getElementById('btn-delete-selected-tabs');

// ─── Shortcuts elements ───────────────────────────────────────────────────────
const shortcutCommandsListEl = document.getElementById('shortcut-commands-list');
const slotPreset1El = document.getElementById('slot-preset-1');
const slotBoard1El = document.getElementById('slot-board-1');
const slotBoard2El = document.getElementById('slot-board-2');
const slotBoard3El = document.getElementById('slot-board-3');
const shortcutSlotStatusEl = document.getElementById('shortcut-slots-status');
const btnSaveShortcutSlots = document.getElementById('btn-save-shortcut-slots');
const btnOpenShortcutsPage = document.getElementById('btn-open-shortcuts-page');

const RULE_TYPE_LABELS = {
  exactDomain: 'Exact domain',
  domainContains: 'Domain contains',
  urlContains: 'URL contains',
  titleContains: 'Title contains',
};

function colourHex(colour) {
  return CATEGORY_COLOURS.find((item) => item.value === colour)?.hex ?? '#9ca3af';
}

function generateId(idPrefix) {
  return `${idPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function getSelectedColour() {
  const checked = colourPickerEl.querySelector('input[name="colour"]:checked');
  return checked ? checked.value : 'grey';
}

function placeholderFor(type) {
  switch (type) {
    case 'exactDomain':
      return 'e.g. app.slack.com';
    case 'domainContains':
      return 'e.g. slack.com';
    case 'urlContains':
      return 'e.g. /workspace/';
    case 'titleContains':
      return 'e.g. Dashboard';
    default:
      return '';
  }
}

function validateUrl(url) {
  try {
    return new URL(url.trim()).href;
  } catch {
    return null;
  }
}

function showDuplicateSettingsStatus(message, isError = false) {
  duplicateSettingsStatusEl.textContent = message;
  duplicateSettingsStatusEl.classList.remove('hidden', 'setting-status--error');
  if (isError) duplicateSettingsStatusEl.classList.add('setting-status--error');
}

function renderColourPicker(selectedColour) {
  colourPickerEl.innerHTML = '';

  for (const { value, label, hex } of CATEGORY_COLOURS) {
    const id = `colour-${value}`;
    const wrapper = document.createElement('label');
    wrapper.className = 'colour-option';
    wrapper.htmlFor = id;
    wrapper.title = label;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'colour';
    radio.id = id;
    radio.value = value;
    radio.checked = value === selectedColour;
    radio.className = 'colour-option__radio';

    const dot = document.createElement('span');
    dot.className = 'colour-option__dot';
    dot.style.setProperty('--colour', hex);

    wrapper.appendChild(radio);
    wrapper.appendChild(dot);
    colourPickerEl.appendChild(wrapper);
  }
}

function renderRules() {
  rulesListEl.innerHTML = '';

  if (draftRules.length === 0) {
    rulesEmptyEl.classList.remove('hidden');
    return;
  }
  rulesEmptyEl.classList.add('hidden');

  draftRules.forEach((rule, index) => {
    const row = document.createElement('div');
    row.className = 'rule-row';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'rule-row__type';
    typeSelect.setAttribute('aria-label', 'Rule type');

    for (const [value, label] of Object.entries(RULE_TYPE_LABELS)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === rule.type;
      typeSelect.appendChild(option);
    }

    typeSelect.addEventListener('change', () => {
      draftRules[index] = { ...draftRules[index], type: typeSelect.value };
      valueInput.placeholder = placeholderFor(typeSelect.value);
    });

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'rule-row__value';
    valueInput.value = rule.value;
    valueInput.placeholder = placeholderFor(rule.type);
    valueInput.setAttribute('aria-label', 'Rule value');
    valueInput.autocomplete = 'off';
    valueInput.addEventListener('input', () => {
      draftRules[index] = { ...draftRules[index], value: valueInput.value };
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'rule-row__remove';
    removeBtn.setAttribute('aria-label', 'Remove rule');
    removeBtn.innerHTML = `
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
      </svg>`;
    removeBtn.addEventListener('click', () => {
      draftRules.splice(index, 1);
      renderRules();
    });

    row.appendChild(typeSelect);
    row.appendChild(valueInput);
    row.appendChild(removeBtn);
    rulesListEl.appendChild(row);
  });
}

function renderCategoryList() {
  categoryListEl.innerHTML = '';

  if (categories.length === 0) {
    categoryListEl.innerHTML = '<p class="list-empty">No categories yet.</p>';
    return;
  }

  categories.forEach((category, index) => {
    const isFirst = index === 0;
    const isOther = category.id === 'other';
    const otherIsLast = categories[categories.length - 1]?.id === 'other';
    const canMoveDown =
      !isOther && index < categories.length - 1 && !(otherIsLast && index === categories.length - 2);
    const canMoveUp = !isFirst && !isOther;
    const ruleCount = (category.rules ?? []).length;
    const ruleCountLabel = ruleCount === 0 ? 'No' : String(ruleCount);

    const item = document.createElement('div');
    item.className = 'cat-item';
    item.innerHTML = `
      <div class="cat-item__reorder">
        <button class="reorder-btn" type="button" aria-label="Move ${escapeHtml(category.name)} up" ${canMoveUp ? '' : 'disabled'} data-action="up" data-id="${escapeHtml(category.id)}">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
        </button>
        <button class="reorder-btn" type="button" aria-label="Move ${escapeHtml(category.name)} down" ${canMoveDown ? '' : 'disabled'} data-action="down" data-id="${escapeHtml(category.id)}">
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
      <span class="cat-item__colour" style="background:${escapeHtml(colourHex(category.colour ?? 'grey'))}" aria-hidden="true"></span>
      <div class="cat-item__info">
        <span class="cat-item__name">${escapeHtml(category.name)}</span>
        <span class="cat-item__rules">${ruleCountLabel} ${ruleCount === 1 ? 'rule' : 'rules'}${category.undeletable ? ' · fallback' : ''}</span>
      </div>
      <div class="cat-item__actions">
        <button class="btn-edit-cat" type="button" data-id="${escapeHtml(category.id)}">Edit</button>
        ${
          category.undeletable
            ? '<button class="btn-delete-cat" type="button" disabled>Delete</button>'
            : `<button class="btn-delete-cat btn-delete-cat--active" type="button" data-id="${escapeHtml(category.id)}">Delete</button>`
        }
      </div>
    `;

    categoryListEl.appendChild(item);
  });

  categoryListEl.querySelectorAll('.reorder-btn').forEach((button) => {
    button.addEventListener('click', () => reorderCategory(button.dataset.id, button.dataset.action));
  });
  categoryListEl.querySelectorAll('.btn-edit-cat').forEach((button) => {
    button.addEventListener('click', () => openEditor(button.dataset.id));
  });
  categoryListEl.querySelectorAll('.btn-delete-cat--active').forEach((button) => {
    button.addEventListener('click', () => deleteCategory(button.dataset.id));
  });
}

async function reorderCategory(id, direction) {
  const index = categories.findIndex((category) => category.id === id);
  if (index === -1) return;

  const otherIndex = categories.findIndex((category) => category.id === 'other');

  if (direction === 'up' && index > 0) {
    [categories[index - 1], categories[index]] = [categories[index], categories[index - 1]];
  } else if (direction === 'down' && index < categories.length - 1) {
    if (id === 'other') return;
    if (otherIndex !== -1 && index + 1 === otherIndex) return;
    [categories[index + 1], categories[index]] = [categories[index], categories[index + 1]];
  }

  categories.forEach((category, categoryIndex) => {
    category.priority = category.id === 'other' ? 999 : (categoryIndex + 1) * 10;
  });

  await persistCategories();
  renderCategoryList();
}

async function deleteCategory(id) {
  const category = categories.find((item) => item.id === id);
  if (!category || category.undeletable) return;

  if (!window.confirm(`Delete the "${category.name}" category? Tabs that matched it will fall through to "Other".`)) {
    return;
  }

  categories = categories.filter((item) => item.id !== id);
  await persistCategories();
  renderCategoryList();
}

function openEditor(id) {
  const category = id ? categories.find((item) => item.id === id) : null;
  editingId = id ?? null;
  draftRules = category ? (category.rules ?? []).map((rule) => ({ ...rule })) : [];

  editorTitleEl.textContent = category ? `Edit "${category.name}"` : 'New Category';
  editorNameEl.value = category?.name ?? '';

  renderColourPicker(category?.colour ?? 'blue');
  renderRules();
  editorEl.classList.remove('hidden');
  editorNameEl.focus();
  editorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeEditor() {
  editorEl.classList.add('hidden');
  editingId = null;
  draftRules = [];
}

async function saveCategory() {
  const name = editorNameEl.value.trim();
  if (!name) {
    editorNameEl.focus();
    editorNameEl.setCustomValidity('Please enter a category name.');
    editorNameEl.reportValidity();
    return;
  }
  editorNameEl.setCustomValidity('');

  const rules = draftRules.filter((rule) => rule.value.trim() !== '');
  const colour = getSelectedColour();

  if (editingId) {
    const index = categories.findIndex((category) => category.id === editingId);
    if (index !== -1) categories[index] = { ...categories[index], name, colour, rules };
  } else {
    const otherIndex = categories.findIndex((category) => category.id === 'other');
    const insertAt = otherIndex !== -1 ? otherIndex : categories.length;
    categories.splice(insertAt, 0, {
      id: generateId('cat'),
      name,
      colour,
      builtin: false,
      undeletable: false,
      priority: insertAt * 10,
      rules,
    });
  }

  categories.forEach((category, index) => {
    category.priority = category.id === 'other' ? 999 : (index + 1) * 10;
  });

  await persistCategories();
  closeEditor();
  renderCategoryList();
}

async function persistCategories() {
  try {
    await setCategories(categories);
  } catch (error) {
    console.error('TabMate: failed to save categories', error);
    window.alert('Failed to save categories. Please try again.');
  }
}

function runPreview() {
  const rawUrl = previewUrlEl.value.trim();
  const rawTitle = previewTitleEl.value.trim();

  if (!rawUrl && !rawTitle) {
    previewResultEl.classList.add('hidden');
    return;
  }

  const fakeTab = {
    url: rawUrl || undefined,
    title: rawTitle || undefined,
  };

  const sorted = [...categories]
    .filter((category) => category.id !== 'other')
    .sort((a, b) => (a.priority ?? 500) - (b.priority ?? 500));
  const otherCategory = categories.find((category) => category.id === 'other');
  const matched = sorted.find((category) => matchTabToCategory(fakeTab, category)) ?? otherCategory ?? null;

  previewMatchEl.textContent = matched ? matched.name : 'No match';
  previewDotEl.style.background = colourHex(matched?.colour ?? 'grey');
  previewResultEl.classList.remove('hidden');
}

function renderPresetList() {
  presetListEl.innerHTML = '';

  if (presets.length === 0) {
    presetListEl.innerHTML = '<p class="list-empty">No presets yet. Create one for your favourite tab sets.</p>';
    return;
  }

  presets.forEach((preset) => {
    const presetMeta = `${preset.tabs.length} tab${preset.tabs.length === 1 ? '' : 's'} · ${
      preset.openBehavior === 'replaceCurrentTabs' ? 'Replace current tabs' : 'Keep current tabs'
    }${preset.category ? ` · ${escapeHtml(preset.category)}` : ''}`;

    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `
      <div class="preset-item__info">
        <span class="preset-item__name">${escapeHtml(preset.name)}</span>
        <span class="preset-item__meta">${presetMeta}</span>
        ${preset.description ? `<span class="preset-item__description">${escapeHtml(preset.description)}</span>` : ''}
      </div>
      <div class="cat-item__actions">
        <button class="btn-edit-cat btn-edit-preset" type="button" data-id="${escapeHtml(preset.id)}">Edit</button>
        <button class="btn-delete-cat btn-delete-preset" type="button" data-id="${escapeHtml(preset.id)}">Delete</button>
      </div>
    `;

    presetListEl.appendChild(item);
  });

  presetListEl.querySelectorAll('.btn-edit-preset').forEach((button) => {
    button.addEventListener('click', () => openPresetEditor(button.dataset.id));
  });
  presetListEl.querySelectorAll('.btn-delete-preset').forEach((button) => {
    button.addEventListener('click', () => deletePreset(button.dataset.id));
  });
}

function renderPresetTabs() {
  presetTabsListEl.innerHTML = '';

  if (draftPresetTabs.length === 0) {
    presetTabsEmptyEl.classList.remove('hidden');
    return;
  }
  presetTabsEmptyEl.classList.add('hidden');

  draftPresetTabs.forEach((tab, index) => {
    const row = document.createElement('div');
    row.className = 'preset-tab-row';
    row.innerHTML = `
      <div class="cat-item__reorder">
        <button class="reorder-btn preset-tab-move" type="button" data-direction="up" data-index="${index}" aria-label="Move tab up" ${index === 0 ? 'disabled' : ''}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
        </button>
        <button class="reorder-btn preset-tab-move" type="button" data-direction="down" data-index="${index}" aria-label="Move tab down" ${index === draftPresetTabs.length - 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </button>
      </div>
      <div class="preset-tab-row__inputs">
        <input class="editor-input preset-tab-row__title" type="text" data-field="title" data-index="${index}" value="${escapeHtml(tab.title ?? '')}" placeholder="Optional title" autocomplete="off" />
        <input class="editor-input preset-tab-row__url" type="url" data-field="url" data-index="${index}" value="${escapeHtml(tab.url ?? '')}" placeholder="https://example.com" autocomplete="off" />
      </div>
      <button class="rule-row__remove preset-tab-remove" type="button" data-index="${index}" aria-label="Remove tab">
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
        </svg>
      </button>
    `;
    presetTabsListEl.appendChild(row);
  });

  presetTabsListEl.querySelectorAll('.preset-tab-row__title, .preset-tab-row__url').forEach((input) => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.index);
      const field = input.dataset.field;
      draftPresetTabs[index] = { ...draftPresetTabs[index], [field]: input.value };
    });
  });

  presetTabsListEl.querySelectorAll('.preset-tab-remove').forEach((button) => {
    button.addEventListener('click', () => {
      draftPresetTabs.splice(Number(button.dataset.index), 1);
      renderPresetTabs();
    });
  });

  presetTabsListEl.querySelectorAll('.preset-tab-move').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const direction = button.dataset.direction;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= draftPresetTabs.length) return;
      [draftPresetTabs[targetIndex], draftPresetTabs[index]] = [draftPresetTabs[index], draftPresetTabs[targetIndex]];
      renderPresetTabs();
    });
  });
}

function openPresetEditor(id) {
  const preset = id ? presets.find((item) => item.id === id) : null;
  editingPresetId = id ?? null;
  draftPresetTabs = preset ? preset.tabs.map((tab) => ({ ...tab })) : [];

  presetEditorTitleEl.textContent = preset ? `Edit "${preset.name}"` : 'New Preset';
  presetNameEl.value = preset?.name ?? '';
  presetDescriptionEl.value = preset?.description ?? '';
  presetOpenBehaviorEl.value = preset?.openBehavior ?? 'addToCurrentTabs';
  presetCategoryEl.value = preset?.category ?? '';
  presetShortcutEl.value = preset?.keyboardShortcut ?? '';

  renderPresetTabs();
  presetEditorEl.classList.remove('hidden');
  presetNameEl.focus();
  presetEditorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closePresetEditor() {
  presetEditorEl.classList.add('hidden');
  editingPresetId = null;
  draftPresetTabs = [];
}

function addDraftPresetTab(tab = { title: '', url: '' }) {
  draftPresetTabs.push({ title: tab.title ?? '', url: tab.url ?? '' });
  renderPresetTabs();
}

async function importCurrentTabs() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const imported = tabs
      .filter((tab) => tab.url && !isInternalUrl(tab.url))
      .map((tab) => ({
        title: tab.title || '',
        url: tab.url,
      }));

    if (imported.length === 0) {
      window.alert('No importable web tabs were found in the current window.');
      return;
    }

    draftPresetTabs.push(...imported);
    renderPresetTabs();
  } catch (error) {
    console.error(error);
    window.alert('Unable to import current tabs.');
  }
}

async function savePreset() {
  const name = presetNameEl.value.trim();
  if (!name) {
    presetNameEl.focus();
    presetNameEl.setCustomValidity('Please enter a preset name.');
    presetNameEl.reportValidity();
    return;
  }
  presetNameEl.setCustomValidity('');

  const normalizedTabs = [];
  for (let index = 0; index < draftPresetTabs.length; index++) {
    const tab = draftPresetTabs[index];
    const url = validateUrl(tab.url ?? '');
    if (!url) {
      const urlInput = presetTabsListEl.querySelector(`.preset-tab-row__url[data-index="${index}"]`);
      if (urlInput) urlInput.focus();
      window.alert('Every preset tab needs a valid URL.');
      return;
    }

    normalizedTabs.push({
      ...(tab.title?.trim() ? { title: tab.title.trim() } : {}),
      url,
    });
  }

  if (normalizedTabs.length === 0) {
    window.alert('Add at least one URL to the preset.');
    return;
  }

  const nextPreset = {
    id: editingPresetId ?? generateId('preset'),
    name,
    ...(presetDescriptionEl.value.trim() ? { description: presetDescriptionEl.value.trim() } : {}),
    tabs: normalizedTabs,
    openBehavior: presetOpenBehaviorEl.value,
    ...(presetCategoryEl.value.trim() ? { category: presetCategoryEl.value.trim() } : {}),
    ...(presetShortcutEl.value.trim() ? { keyboardShortcut: presetShortcutEl.value.trim() } : {}),
  };

  if (editingPresetId) {
    const index = presets.findIndex((preset) => preset.id === editingPresetId);
    if (index !== -1) presets[index] = nextPreset;
  } else {
    presets.push(nextPreset);
  }

  await persistPresets();
  closePresetEditor();
  renderPresetList();
}

async function deletePreset(id) {
  const preset = presets.find((item) => item.id === id);
  if (!preset) return;

  if (!window.confirm(`Delete the "${preset.name}" preset?`)) return;

  presets = presets.filter((item) => item.id !== id);
  await persistPresets();
  renderPresetList();
}

async function persistPresets() {
  try {
    await setPresets(presets);
  } catch (error) {
    console.error('TabMate: failed to save presets', error);
    window.alert('Failed to save presets. Please try again.');
  }
}

function renderDuplicateSettings() {
  const mode = userSettings?.duplicateDetection?.mode ?? 'exact';
  duplicateModeInputs.forEach((input) => {
    input.checked = input.value === mode;
  });
}

async function updateDuplicateMode(mode) {
  if (!userSettings) return;

  const previousMode = userSettings.duplicateDetection?.mode ?? 'exact';
  userSettings = {
    ...userSettings,
    duplicateDetection: {
      ...userSettings.duplicateDetection,
      enabled: true,
      mode,
    },
  };

  try {
    await setSettings(userSettings);
    showDuplicateSettingsStatus(`Saved ${mode === 'exact' ? 'Exact' : 'Generalised'} duplicate detection.`);
  } catch (error) {
    console.error(error);
    userSettings.duplicateDetection.mode = previousMode;
    renderDuplicateSettings();
    showDuplicateSettingsStatus('Unable to save duplicate detection settings.', true);
  }
}

// ─── Boards ───────────────────────────────────────────────────────────────────

function renderBoardList() {
  boardListEl.innerHTML = '';

  if (boards.length === 0) {
    boardListEl.innerHTML = '<p class="list-empty">No boards yet.</p>';
    return;
  }

  boards.forEach((board) => {
    const tabCount = savedTabs.filter((t) => t.boardId === board.id).length;
    const isSystem = board.isSystem;
    const isDefault = board.isDefault;

    const item = document.createElement('div');
    item.className = 'board-item';
    item.innerHTML = `
      <div class="board-item__info">
        <span class="board-item__name">${escapeHtml(board.name)}${isDefault ? ' <span class="board-item__badge">Default</span>' : ''}</span>
        <span class="board-item__meta">${tabCount} saved tab${tabCount === 1 ? '' : 's'}${board.description ? ' · ' + escapeHtml(board.description) : ''}</span>
      </div>
      <div class="cat-item__actions">
        <button class="btn-edit-cat btn-open-board" type="button" data-id="${escapeHtml(board.id)}">Open</button>
        ${isDefault ? '' : `<button class="btn-edit-cat btn-set-default-board" type="button" data-id="${escapeHtml(board.id)}">Set default</button>`}
        ${isSystem ? '' : `<button class="btn-edit-cat btn-edit-board" type="button" data-id="${escapeHtml(board.id)}">Edit</button>`}
        ${isSystem
          ? '<button class="btn-delete-cat" type="button" disabled title="System boards cannot be deleted">Delete</button>'
          : `<button class="btn-delete-cat btn-delete-board btn-delete-cat--active" type="button" data-id="${escapeHtml(board.id)}">Delete</button>`
        }
      </div>
    `;
    boardListEl.appendChild(item);
  });

  boardListEl.querySelectorAll('.btn-open-board').forEach((btn) => {
    btn.addEventListener('click', () => openBoardTabsView(btn.dataset.id));
  });
  boardListEl.querySelectorAll('.btn-set-default-board').forEach((btn) => {
    btn.addEventListener('click', () => setDefaultBoard(btn.dataset.id));
  });
  boardListEl.querySelectorAll('.btn-edit-board').forEach((btn) => {
    btn.addEventListener('click', () => openBoardEditor(btn.dataset.id));
  });
  boardListEl.querySelectorAll('.btn-delete-board').forEach((btn) => {
    btn.addEventListener('click', () => deleteBoard(btn.dataset.id));
  });
}

function openBoardEditor(id) {
  const board = id ? boards.find((b) => b.id === id) : null;
  editingBoardId = id ?? null;
  boardEditorTitleEl.textContent = board ? `Edit "${board.name}"` : 'New Board';
  boardNameEl.value = board?.name ?? '';
  boardDescriptionEl.value = board?.description ?? '';
  boardEditorEl.classList.remove('hidden');
  boardNameEl.focus();
  boardEditorEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeBoardEditor() {
  boardEditorEl.classList.add('hidden');
  editingBoardId = null;
}

async function saveBoard() {
  const name = boardNameEl.value.trim();
  if (!name) {
    boardNameEl.focus();
    boardNameEl.setCustomValidity('Please enter a board name.');
    boardNameEl.reportValidity();
    return;
  }
  boardNameEl.setCustomValidity('');

  const now = Date.now();
  if (editingBoardId) {
    const index = boards.findIndex((b) => b.id === editingBoardId);
    if (index !== -1) {
      boards[index] = {
        ...boards[index],
        name,
        ...(boardDescriptionEl.value.trim() ? { description: boardDescriptionEl.value.trim() } : {}),
        updatedAt: now,
      };
    }
  } else {
    const newBoard = {
      id: generateId('board'),
      name,
      ...(boardDescriptionEl.value.trim() ? { description: boardDescriptionEl.value.trim() } : {}),
      createdAt: now,
      updatedAt: now,
      isSystem: false,
      isDefault: false,
    };
    boards.push(newBoard);
  }

  await persistBoards();
  closeBoardEditor();
  renderBoardList();
}

async function deleteBoard(id) {
  const board = boards.find((b) => b.id === id);
  if (!board) return;
  if (board.isSystem) return;

  const tabCount = savedTabs.filter((t) => t.boardId === id).length;
  const confirmMsg = tabCount > 0
    ? `Delete board "${board.name}" and its ${tabCount} saved tab${tabCount === 1 ? '' : 's'}?`
    : `Delete board "${board.name}"?`;
  if (!window.confirm(confirmMsg)) return;

  boards = boards.filter((b) => b.id !== id);
  savedTabs = savedTabs.filter((t) => t.boardId !== id);

  // If deleted board was default, reset to unorganised
  if (board.isDefault) {
    const unorganised = boards.find((b) => b.id === 'unorganised');
    if (unorganised) unorganised.isDefault = true;
  }

  await Promise.all([persistBoards(), persistSavedTabs()]);
  renderBoardList();
}

async function setDefaultBoard(id) {
  boards = boards.map((b) => ({ ...b, isDefault: b.id === id }));

  if (userSettings) {
    userSettings = { ...userSettings, defaultBoardId: id };
    await setSettings(userSettings);
  }

  await persistBoards();
  renderBoardList();
}

async function persistBoards() {
  try {
    await setBoards(boards);
  } catch (error) {
    console.error('TabMate: failed to save boards', error);
    window.alert('Failed to save boards. Please try again.');
  }
}

async function persistSavedTabs() {
  try {
    await setSavedTabs(savedTabs);
  } catch (error) {
    console.error('TabMate: failed to save tabs', error);
    window.alert('Failed to save tabs. Please try again.');
  }
}

// ─── Board tabs view ──────────────────────────────────────────────────────────

function openBoardTabsView(boardId) {
  openBoardId = boardId;
  const board = boards.find((b) => b.id === boardId);
  boardTabsTitleEl.textContent = board ? board.name : 'Board';

  boardListEl.classList.add('hidden');
  boardEditorEl.classList.add('hidden');
  btnAddBoard.disabled = true;
  boardTabsViewEl.classList.remove('hidden');

  renderBoardTabs();
}

function closeBoardTabsView() {
  openBoardId = null;
  boardTabsViewEl.classList.add('hidden');
  boardListEl.classList.remove('hidden');
  btnAddBoard.disabled = false;
  renderBoardList();
}

function getSelectedTabIds() {
  return Array.from(boardTabsListEl.querySelectorAll('.board-tab-item__checkbox:checked')).map(
    (cb) => cb.dataset.id,
  );
}

function updateBoardTabsToolbar() {
  const selectedIds = getSelectedTabIds();
  const hasSelection = selectedIds.length > 0;
  btnOpenSelectedTabs.disabled = !hasSelection;
  btnMoveSelectedTabs.disabled = !hasSelection;
  btnDeleteSelectedTabs.disabled = !hasSelection;
}

function renderBoardTabs() {
  boardTabsListEl.innerHTML = '';
  const boardTabItems = savedTabs.filter((t) => t.boardId === openBoardId);

  if (boardTabItems.length === 0) {
    boardTabsListEl.innerHTML = '<p class="list-empty">No saved tabs in this board.</p>';
    updateBoardTabsToolbar();
    return;
  }

  boardTabItems.forEach((tab) => {
    const item = document.createElement('div');
    item.className = 'board-tab-item';
    const savedDate = new Date(tab.savedAt).toLocaleDateString(undefined, { dateStyle: 'medium' });
    item.innerHTML = `
      <label class="board-tab-item__check">
        <input class="board-tab-item__checkbox" type="checkbox" data-id="${escapeHtml(tab.id)}" aria-label="Select ${escapeHtml(tab.title)}" />
      </label>
      ${tab.faviconUrl ? `<img class="board-tab-item__favicon" src="${escapeHtml(tab.faviconUrl)}" alt="" width="16" height="16" />` : '<span class="board-tab-item__favicon-placeholder"></span>'}
      <div class="board-tab-item__info">
        <a class="board-tab-item__title" href="${escapeHtml(tab.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tab.title)}</a>
        <span class="board-tab-item__meta">${escapeHtml(tab.url)} · Saved ${savedDate}</span>
      </div>
      <button class="btn-delete-cat btn-delete-cat--active board-tab-item__delete" type="button" data-id="${escapeHtml(tab.id)}" aria-label="Delete ${escapeHtml(tab.title)}">Delete</button>
    `;
    boardTabsListEl.appendChild(item);
  });

  boardTabsListEl.querySelectorAll('.board-tab-item__checkbox').forEach((cb) => {
    cb.addEventListener('change', updateBoardTabsToolbar);
  });

  boardTabsListEl.querySelectorAll('.board-tab-item__delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteSavedTab(btn.dataset.id));
  });

  updateBoardTabsToolbar();
}

async function deleteSavedTab(id) {
  savedTabs = savedTabs.filter((t) => t.id !== id);
  await persistSavedTabs();
  renderBoardTabs();
}

async function deleteSelectedTabs() {
  const ids = new Set(getSelectedTabIds());
  if (ids.size === 0) return;
  if (!window.confirm(`Delete ${ids.size} saved tab${ids.size === 1 ? '' : 's'}?`)) return;
  savedTabs = savedTabs.filter((t) => !ids.has(t.id));
  await persistSavedTabs();
  renderBoardTabs();
}

async function openSelectedTabs() {
  const ids = new Set(getSelectedTabIds());
  const tabsToOpen = savedTabs.filter((t) => ids.has(t.id));
  for (const [index, tab] of tabsToOpen.entries()) {
    await chrome.tabs.create({ url: tab.url, active: index === 0 });
  }
}

async function openAllBoardTabs() {
  const tabsToOpen = savedTabs.filter((t) => t.boardId === openBoardId);
  for (const [index, tab] of tabsToOpen.entries()) {
    await chrome.tabs.create({ url: tab.url, active: index === 0 });
  }
}

async function moveSelectedTabs() {
  const ids = new Set(getSelectedTabIds());
  if (ids.size === 0) return;

  const otherBoards = boards.filter((b) => b.id !== openBoardId);
  if (otherBoards.length === 0) {
    window.alert('No other boards to move tabs to. Create another board first.');
    return;
  }

  const options = otherBoards.map((b) => `${b.id}: ${b.name}`).join('\n');
  const input = window.prompt(`Move ${ids.size} tab${ids.size === 1 ? '' : 's'} to which board?\n\n${options}\n\nEnter board name:`);
  if (!input) return;

  const target = otherBoards.find((b) => b.name.toLowerCase() === input.trim().toLowerCase());
  if (!target) {
    window.alert('Board not found. Please type the exact board name.');
    return;
  }

  const now = Date.now();
  savedTabs = savedTabs.map((t) =>
    ids.has(t.id) ? { ...t, boardId: target.id } : t
  );
  target.updatedAt = now;

  await Promise.all([persistSavedTabs(), persistBoards()]);
  renderBoardTabs();
}

// ─── Shortcuts ────────────────────────────────────────────────────────────────

async function renderShortcutCommands() {
  if (!shortcutCommandsListEl) return;
  shortcutCommandsListEl.innerHTML = '';

  try {
    const commands = await chrome.commands.getAll();
    if (!commands || commands.length === 0) {
      shortcutCommandsListEl.innerHTML = '<p class="list-empty">No commands registered.</p>';
      return;
    }

    commands.forEach((cmd) => {
      const row = document.createElement('div');
      row.className = 'shortcut-command-row';
      row.innerHTML = `
        <span class="shortcut-command-row__label">${escapeHtml(cmd.description || cmd.name)}</span>
        <kbd class="shortcut-row__key">${escapeHtml(cmd.shortcut || 'Not set')}</kbd>
      `;
      shortcutCommandsListEl.appendChild(row);
    });
  } catch {
    shortcutCommandsListEl.innerHTML = '<p class="list-empty">Unable to load shortcuts.</p>';
  }
}

function populateSlotSelects() {
  const boardOptions = ['<option value="">(none)</option>',
    ...boards.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`)
  ].join('');
  const presetOptions = ['<option value="">(none)</option>',
    ...presets.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`)
  ].join('');

  if (slotPreset1El) slotPreset1El.innerHTML = presetOptions;
  if (slotBoard1El) slotBoard1El.innerHTML = boardOptions;
  if (slotBoard2El) slotBoard2El.innerHTML = boardOptions;
  if (slotBoard3El) slotBoard3El.innerHTML = boardOptions;

  const slots = userSettings?.shortcutSlots ?? {};
  if (slotPreset1El) slotPreset1El.value = slots.presetSlot1 ?? '';
  if (slotBoard1El) slotBoard1El.value = slots.boardSlot1 ?? '';
  if (slotBoard2El) slotBoard2El.value = slots.boardSlot2 ?? '';
  if (slotBoard3El) slotBoard3El.value = slots.boardSlot3 ?? '';
}

async function saveShortcutSlots() {
  if (!userSettings) return;

  userSettings = {
    ...userSettings,
    shortcutSlots: {
      presetSlot1: slotPreset1El?.value ?? '',
      boardSlot1: slotBoard1El?.value ?? '',
      boardSlot2: slotBoard2El?.value ?? '',
      boardSlot3: slotBoard3El?.value ?? '',
    },
  };

  try {
    await setSettings(userSettings);
    if (shortcutSlotStatusEl) {
      shortcutSlotStatusEl.textContent = 'Shortcut assignments saved.';
      shortcutSlotStatusEl.classList.remove('hidden', 'setting-status--error');
    }
  } catch (error) {
    console.error(error);
    if (shortcutSlotStatusEl) {
      shortcutSlotStatusEl.textContent = 'Failed to save shortcut assignments.';
      shortcutSlotStatusEl.classList.remove('hidden');
      shortcutSlotStatusEl.classList.add('setting-status--error');
    }
  }
}

// ─── Notifications settings ───────────────────────────────────────────────────

function getNotifEl(id) { return document.getElementById(id); }

function setToggleState(btn, enabled) {
  if (btn) btn.setAttribute('aria-checked', String(enabled));
}

function getToggleState(btn) {
  return btn?.getAttribute('aria-checked') === 'true';
}

async function renderNotificationSettings() {
  const pn = userSettings?.popupNotifications ?? {};

  setToggleState(getNotifEl('notif-global-toggle'), pn.enabled ?? true);
  updateNotifConfigVisibility(pn.enabled ?? true);

  const posEl = getNotifEl('notif-position');
  if (posEl) posEl.value = pn.position ?? 'bottom-left';

  setToggleState(getNotifEl('notif-new-tabs-toggle'), pn.newTabsEnabled ?? true);
  const newTabsThreshEl = getNotifEl('notif-new-tabs-threshold');
  if (newTabsThreshEl) newTabsThreshEl.value = String(pn.newTabsThreshold ?? 8);

  setToggleState(getNotifEl('notif-duplicates-toggle'), pn.duplicatesEnabled ?? true);
  const dupThreshEl = getNotifEl('notif-duplicates-threshold');
  if (dupThreshEl) dupThreshEl.value = String(pn.duplicatesThreshold ?? 3);

  setToggleState(getNotifEl('notif-many-tabs-toggle'), pn.manyTabsEnabled ?? true);
  const manyThreshEl = getNotifEl('notif-many-tabs-threshold');
  if (manyThreshEl) manyThreshEl.value = String(pn.manyTabsThreshold ?? 25);

  setToggleState(getNotifEl('notif-save-confirm-toggle'), pn.saveConfirmEnabled ?? true);
}

function updateNotifConfigVisibility(enabled) {
  const card = getNotifEl('notif-config-card');
  if (card) card.style.opacity = enabled ? '1' : '0.45';
  if (card) card.style.pointerEvents = enabled ? '' : 'none';
}

async function saveNotificationSettings() {
  const statusEl = getNotifEl('notif-status');
  try {
    const pn = {
      enabled: getToggleState(getNotifEl('notif-global-toggle')),
      position: getNotifEl('notif-position')?.value ?? 'bottom-left',
      newTabsEnabled: getToggleState(getNotifEl('notif-new-tabs-toggle')),
      newTabsThreshold: Math.max(2, parseInt(getNotifEl('notif-new-tabs-threshold')?.value ?? '8', 10) || 8),
      duplicatesEnabled: getToggleState(getNotifEl('notif-duplicates-toggle')),
      duplicatesThreshold: Math.max(1, parseInt(getNotifEl('notif-duplicates-threshold')?.value ?? '3', 10) || 3),
      manyTabsEnabled: getToggleState(getNotifEl('notif-many-tabs-toggle')),
      manyTabsThreshold: Math.max(5, parseInt(getNotifEl('notif-many-tabs-threshold')?.value ?? '25', 10) || 25),
      saveConfirmEnabled: getToggleState(getNotifEl('notif-save-confirm-toggle')),
    };

    userSettings = { ...(userSettings ?? {}), popupNotifications: pn };
    await setSettings(userSettings);

    if (statusEl) {
      statusEl.textContent = 'Notification settings saved.';
      statusEl.classList.remove('hidden', 'setting-status--error');
      statusEl.classList.add('setting-status--ok');
      setTimeout(() => statusEl.classList.add('hidden'), 2500);
    }
  } catch (error) {
    console.error(error);
    if (statusEl) {
      statusEl.textContent = 'Failed to save notification settings.';
      statusEl.classList.remove('hidden');
      statusEl.classList.add('setting-status--error');
    }
  }
}

function initNotificationSettings() {
  const globalToggle = getNotifEl('notif-global-toggle');
  if (globalToggle) {
    globalToggle.addEventListener('click', () => {
      const next = !getToggleState(globalToggle);
      setToggleState(globalToggle, next);
      updateNotifConfigVisibility(next);
    });
  }

  ['notif-new-tabs-toggle', 'notif-duplicates-toggle', 'notif-many-tabs-toggle', 'notif-save-confirm-toggle'].forEach((id) => {
    const btn = getNotifEl(id);
    if (btn) {
      btn.addEventListener('click', () => setToggleState(btn, !getToggleState(btn)));
    }
  });

  const saveBtn = getNotifEl('btn-save-notif');
  if (saveBtn) saveBtn.addEventListener('click', saveNotificationSettings);
}
  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      navItems.forEach((navItem) => navItem.classList.toggle('active', navItem === item));
      document.getElementById(`section-${item.dataset.section}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  });
}

async function init() {
  try {
    [categories, presets, userSettings, boards, savedTabs] = await Promise.all([
      getCategories(),
      getPresets(),
      getSettings(),
      getBoards(),
      getSavedTabs(),
    ]);

    const otherIndex = categories.findIndex((category) => category.id === 'other');
    if (otherIndex !== -1 && otherIndex !== categories.length - 1) {
      const [other] = categories.splice(otherIndex, 1);
      categories.push(other);
      await persistCategories();
    }

    renderCategoryList();
    renderPresetList();
    renderDuplicateSettings();
    renderBoardList();
    await renderShortcutCommands();
    populateSlotSelects();
    await renderNotificationSettings();
  } catch (error) {
    console.error('TabMate: failed to load settings', error);
  }

  initSidebarNavigation();
  initNotificationSettings();

  btnAddCategory.addEventListener('click', () => openEditor(null));
  btnAddRule.addEventListener('click', () => {
    draftRules.push({ type: 'domainContains', value: '' });
    renderRules();
    const inputs = rulesListEl.querySelectorAll('.rule-row__value');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  });
  btnSaveCategory.addEventListener('click', saveCategory);
  btnCancelEditor.addEventListener('click', closeEditor);

  btnPreview.addEventListener('click', runPreview);
  previewUrlEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runPreview();
  });
  previewTitleEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') runPreview();
  });

  btnAddPreset.addEventListener('click', () => openPresetEditor(null));
  btnAddPresetTab.addEventListener('click', () => addDraftPresetTab());
  btnImportCurrentTabs.addEventListener('click', importCurrentTabs);
  btnSavePreset.addEventListener('click', savePreset);
  btnCancelPreset.addEventListener('click', closePresetEditor);

  duplicateModeInputs.forEach((input) => {
    input.addEventListener('change', () => updateDuplicateMode(input.value));
  });

  // Boards
  btnAddBoard.addEventListener('click', () => openBoardEditor(null));
  btnSaveBoard.addEventListener('click', saveBoard);
  btnCancelBoard.addEventListener('click', closeBoardEditor);
  btnBackBoards.addEventListener('click', closeBoardTabsView);
  btnSelectAllTabs.addEventListener('click', () => {
    boardTabsListEl.querySelectorAll('.board-tab-item__checkbox').forEach((cb) => { cb.checked = true; });
    updateBoardTabsToolbar();
  });
  btnDeselectAllTabs.addEventListener('click', () => {
    boardTabsListEl.querySelectorAll('.board-tab-item__checkbox').forEach((cb) => { cb.checked = false; });
    updateBoardTabsToolbar();
  });
  btnOpenSelectedTabs.addEventListener('click', openSelectedTabs);
  btnOpenAllTabs.addEventListener('click', openAllBoardTabs);
  btnMoveSelectedTabs.addEventListener('click', moveSelectedTabs);
  btnDeleteSelectedTabs.addEventListener('click', deleteSelectedTabs);

  // Shortcuts
  if (btnSaveShortcutSlots) btnSaveShortcutSlots.addEventListener('click', saveShortcutSlots);
  if (btnOpenShortcutsPage) {
    btnOpenShortcutsPage.addEventListener('click', () => {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts', active: true });
    });
  }
}

init();

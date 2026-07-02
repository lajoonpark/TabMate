import {
  getCategories,
  setCategories,
  getPresets,
  setPresets,
  getSettings,
  setSettings,
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

let editingId = null;
let draftRules = [];
let editingPresetId = null;
let draftPresetTabs = [];

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

const RULE_TYPE_LABELS = {
  exactDomain: 'Exact domain',
  domainContains: 'Domain contains',
  urlContains: 'URL contains',
  titleContains: 'Title contains',
};

function colourHex(colour) {
  return CATEGORY_COLOURS.find((item) => item.value === colour)?.hex ?? '#9ca3af';
}

function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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
        <span class="cat-item__rules">${(category.rules ?? []).length || 'No'} ${(category.rules ?? []).length === 1 ? 'rule' : 'rules'}${category.undeletable ? ' · fallback' : ''}</span>
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
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `
      <div class="preset-item__info">
        <span class="preset-item__name">${escapeHtml(preset.name)}</span>
        <span class="preset-item__meta">${preset.tabs.length} tab${preset.tabs.length === 1 ? '' : 's'} · ${preset.openBehavior === 'replaceCurrentTabs' ? 'Replace current tabs' : 'Keep current tabs'}${preset.category ? ` · ${escapeHtml(preset.category)}` : ''}</span>
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
  for (let index = 0; index < draftPresetTabs.length; index += 1) {
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

function initSidebarNavigation() {
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
    [categories, presets, userSettings] = await Promise.all([
      getCategories(),
      getPresets(),
      getSettings(),
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
  } catch (error) {
    console.error('TabMate: failed to load settings', error);
  }

  initSidebarNavigation();

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
}

init();

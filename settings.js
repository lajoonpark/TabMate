/**
 * settings.js — TabMate categories settings page.
 *
 * Handles full CRUD for user categories and their matching rules,
 * reordering, and a live preview/test area.
 */

import { getCategories, setCategories } from './lib/storage.js';
import { CATEGORY_COLOURS, matchTabToCategory, escapeHtml } from './lib/utils.js';

// ─── State ────────────────────────────────────────────────────────────────────

/** @type {import('./lib/defaults.js').Category[]} */
let categories = [];

/** Id of the category currently being edited, or null for a new category. */
let editingId = null;

/** In-progress rules list while the editor is open. */
let draftRules = [];

// ─── Element references ───────────────────────────────────────────────────────

const categoryListEl   = document.getElementById('category-list');
const editorEl         = document.getElementById('category-editor');
const editorTitleEl    = document.getElementById('editor-title');
const editorNameEl     = document.getElementById('editor-name');
const colourPickerEl   = document.getElementById('colour-picker');
const rulesListEl      = document.getElementById('rules-list');
const rulesEmptyEl     = document.getElementById('rules-empty');
const btnAddCategory   = document.getElementById('btn-add-category');
const btnAddRule       = document.getElementById('btn-add-rule');
const btnSaveCategory  = document.getElementById('btn-save-category');
const btnCancelEditor  = document.getElementById('btn-cancel-editor');
const previewUrlEl     = document.getElementById('preview-url');
const previewTitleEl   = document.getElementById('preview-title');
const btnPreview       = document.getElementById('btn-preview');
const previewResultEl  = document.getElementById('preview-result');
const previewDotEl     = document.getElementById('preview-dot');
const previewMatchEl   = document.getElementById('preview-match');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns a hex colour for a Chrome tabGroups colour token.
 * @param {string} colour
 * @returns {string}
 */
function colourHex(colour) {
  return CATEGORY_COLOURS.find((c) => c.value === colour)?.hex ?? '#9ca3af';
}

/**
 * Generates a short random id for new user categories.
 * @returns {string}
 */
function generateId() {
  return `cat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Returns the currently selected colour token from the colour picker radios.
 * @returns {string}
 */
function getSelectedColour() {
  const checked = colourPickerEl.querySelector('input[name="colour"]:checked');
  return checked ? checked.value : 'grey';
}

// ─── Colour picker ────────────────────────────────────────────────────────────

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

// ─── Rules editor ─────────────────────────────────────────────────────────────

const RULE_TYPE_LABELS = {
  exactDomain:    'Exact domain',
  domainContains: 'Domain contains',
  urlContains:    'URL contains',
  titleContains:  'Title contains',
};

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
    row.dataset.index = index;

    // Type selector
    const typeSelect = document.createElement('select');
    typeSelect.className = 'rule-row__type';
    typeSelect.setAttribute('aria-label', 'Rule type');

    for (const [value, label] of Object.entries(RULE_TYPE_LABELS)) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      opt.selected = value === rule.type;
      typeSelect.appendChild(opt);
    }

    typeSelect.addEventListener('change', () => {
      draftRules[index] = { ...draftRules[index], type: typeSelect.value };
    });

    // Value input
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

    // Keep placeholder in sync with type changes
    typeSelect.addEventListener('change', () => {
      valueInput.placeholder = placeholderFor(typeSelect.value);
    });

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'rule-row__remove';
    removeBtn.setAttribute('aria-label', 'Remove rule');
    removeBtn.title = 'Remove rule';
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

function placeholderFor(type) {
  switch (type) {
    case 'exactDomain':    return 'e.g. app.slack.com';
    case 'domainContains': return 'e.g. slack.com';
    case 'urlContains':    return 'e.g. /workspace/';
    case 'titleContains':  return 'e.g. Dashboard';
    default:               return '';
  }
}

// ─── Category list ────────────────────────────────────────────────────────────

function renderCategoryList() {
  categoryListEl.innerHTML = '';

  if (categories.length === 0) {
    categoryListEl.innerHTML = '<p class="list-empty">No categories yet.</p>';
    return;
  }

  categories.forEach((cat, index) => {
    const isFirst = index === 0;
    // "Other" is always last and cannot be moved past the second-to-last
    const isLast  = index === categories.length - 1;
    const isOther = cat.id === 'other';

    const item = document.createElement('div');
    item.className = 'cat-item';
    item.dataset.id = cat.id;

    const hex = colourHex(cat.colour ?? 'grey');
    const ruleCount = (cat.rules ?? []).length;

    item.innerHTML = `
      <div class="cat-item__reorder">
        <button
          class="reorder-btn"
          type="button"
          aria-label="Move ${escapeHtml(cat.name)} up"
          ${isFirst || (isOther && categories.length > 1) ? 'disabled' : ''}
          data-action="up"
          data-id="${escapeHtml(cat.id)}"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
        <button
          class="reorder-btn"
          type="button"
          aria-label="Move ${escapeHtml(cat.name)} down"
          ${isLast || (isOther) ? 'disabled' : (index === categories.length - 2 && categories[categories.length - 1]?.id === 'other') ? 'disabled' : ''}
          data-action="down"
          data-id="${escapeHtml(cat.id)}"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
      <span class="cat-item__colour" style="background:${escapeHtml(hex)}" aria-hidden="true"></span>
      <div class="cat-item__info">
        <span class="cat-item__name">${escapeHtml(cat.name)}</span>
        <span class="cat-item__rules">${ruleCount === 0 ? 'No rules' : `${ruleCount} rule${ruleCount === 1 ? '' : 's'}`}${cat.undeletable ? ' · fallback' : ''}</span>
      </div>
      <div class="cat-item__actions">
        <button class="btn-edit-cat" type="button" data-id="${escapeHtml(cat.id)}" aria-label="Edit ${escapeHtml(cat.name)}">Edit</button>
        ${cat.undeletable
          ? '<button class="btn-delete-cat" type="button" disabled title="This category cannot be deleted">Delete</button>'
          : `<button class="btn-delete-cat btn-delete-cat--active" type="button" data-id="${escapeHtml(cat.id)}" aria-label="Delete ${escapeHtml(cat.name)}">Delete</button>`
        }
      </div>
    `;

    categoryListEl.appendChild(item);
  });

  // Wire reorder buttons
  categoryListEl.querySelectorAll('.reorder-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const direction = btn.dataset.action;
      reorderCategory(id, direction);
    });
  });

  // Wire edit buttons
  categoryListEl.querySelectorAll('.btn-edit-cat').forEach((btn) => {
    btn.addEventListener('click', () => openEditor(btn.dataset.id));
  });

  // Wire delete buttons
  categoryListEl.querySelectorAll('.btn-delete-cat--active').forEach((btn) => {
    btn.addEventListener('click', () => deleteCategory(btn.dataset.id));
  });
}

// ─── Reorder ──────────────────────────────────────────────────────────────────

async function reorderCategory(id, direction) {
  const idx = categories.findIndex((c) => c.id === id);
  if (idx === -1) return;

  const otherIdx = categories.findIndex((c) => c.id === 'other');

  if (direction === 'up' && idx > 0) {
    // Cannot move past the first slot
    [categories[idx - 1], categories[idx]] = [categories[idx], categories[idx - 1]];
  } else if (direction === 'down' && idx < categories.length - 1) {
    // Cannot move "Other" down or move a non-other category into Other's position
    if (id === 'other') return;
    // Don't allow moving past "Other"
    if (otherIdx !== -1 && idx + 1 === otherIdx) return;
    [categories[idx + 1], categories[idx]] = [categories[idx], categories[idx + 1]];
  }

  // Re-assign priority values to reflect new order (Other stays at 999)
  categories.forEach((cat, i) => {
    cat.priority = cat.id === 'other' ? 999 : (i + 1) * 10;
  });

  await persist();
  renderCategoryList();
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteCategory(id) {
  const cat = categories.find((c) => c.id === id);
  if (!cat || cat.undeletable) return;

  if (!window.confirm(`Delete the "${cat.name}" category? Tabs that matched it will fall through to "Other".`)) {
    return;
  }

  categories = categories.filter((c) => c.id !== id);
  await persist();
  renderCategoryList();
}

// ─── Editor ───────────────────────────────────────────────────────────────────

function openEditor(id) {
  const cat = id ? categories.find((c) => c.id === id) : null;
  editingId = id ?? null;
  draftRules = cat ? (cat.rules ?? []).map((r) => ({ ...r })) : [];

  editorTitleEl.textContent = cat ? `Edit "${cat.name}"` : 'New Category';
  editorNameEl.value = cat?.name ?? '';

  renderColourPicker(cat?.colour ?? 'blue');
  renderRules();

  editorEl.classList.remove('hidden');
  editorNameEl.focus();

  // Scroll editor into view
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

  // Strip empty rules
  const rules = draftRules.filter((r) => r.value.trim() !== '');
  const colour = getSelectedColour();

  if (editingId) {
    // Update existing
    const idx = categories.findIndex((c) => c.id === editingId);
    if (idx !== -1) {
      categories[idx] = { ...categories[idx], name, colour, rules };
    }
  } else {
    // Insert before "Other"
    const otherIdx = categories.findIndex((c) => c.id === 'other');
    const insertAt = otherIdx !== -1 ? otherIdx : categories.length;
    const newCat = {
      id: generateId(),
      name,
      colour,
      builtin: false,
      undeletable: false,
      priority: insertAt * 10,
      rules,
    };
    categories.splice(insertAt, 0, newCat);
  }

  // Reassign priorities
  categories.forEach((cat, i) => {
    cat.priority = cat.id === 'other' ? 999 : (i + 1) * 10;
  });

  await persist();
  closeEditor();
  renderCategoryList();
}

// ─── Persist ──────────────────────────────────────────────────────────────────

async function persist() {
  try {
    await setCategories(categories);
  } catch (err) {
    console.error('TabMate: failed to save categories', err);
    window.alert('Failed to save categories. Please try again.');
  }
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function runPreview() {
  const rawUrl   = previewUrlEl.value.trim();
  const rawTitle = previewTitleEl.value.trim();

  if (!rawUrl && !rawTitle) {
    previewResultEl.classList.add('hidden');
    return;
  }

  // Build a synthetic tab object for matching
  const fakeTab = {
    url:   rawUrl   || undefined,
    title: rawTitle || undefined,
    pinned: false,
  };

  // Sort categories by priority; skip "Other" (it's the implicit fallback)
  const sorted = [...categories]
    .filter((c) => c.id !== 'other')
    .sort((a, b) => (a.priority ?? 500) - (b.priority ?? 500));

  const otherCat = categories.find((c) => c.id === 'other');
  const matched = sorted.find((cat) => matchTabToCategory(fakeTab, cat)) ?? otherCat ?? null;

  if (!matched) {
    previewMatchEl.textContent = 'No match';
    previewDotEl.style.background = '#9ca3af';
  } else {
    previewMatchEl.textContent = matched.name;
    previewDotEl.style.background = colourHex(matched.colour ?? 'grey');
  }

  previewResultEl.classList.remove('hidden');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    categories = await getCategories();
    renderCategoryList();

    // Ensure "Other" is always last
    const otherIdx = categories.findIndex((c) => c.id === 'other');
    if (otherIdx !== -1 && otherIdx !== categories.length - 1) {
      const [other] = categories.splice(otherIdx, 1);
      categories.push(other);
      await persist();
      renderCategoryList();
    }
  } catch (err) {
    console.error('TabMate: failed to load categories', err);
  }

  btnAddCategory.addEventListener('click', () => openEditor(null));

  btnAddRule.addEventListener('click', () => {
    draftRules.push({ type: 'domainContains', value: '' });
    renderRules();
    // Focus the new rule's value input
    const inputs = rulesListEl.querySelectorAll('.rule-row__value');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  });

  btnSaveCategory.addEventListener('click', saveCategory);
  btnCancelEditor.addEventListener('click', closeEditor);

  btnPreview.addEventListener('click', runPreview);
  previewUrlEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') runPreview(); });
  previewTitleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') runPreview(); });
}

init();

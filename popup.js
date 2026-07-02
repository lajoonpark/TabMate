import {
  categorizeTabsWithCategories,
  findDuplicateGroups,
  isClosableTab,
  isInternalUrl,
  planDuplicateTabRemoval,
  escapeHtml,
} from './lib/utils.js';
import {
  getUndoTabs,
  getSettings,
  setSettings,
  getPresets,
  getBoards,
  setBoards,
  getCategories,
} from './lib/storage.js';

// ─── State ────────────────────────────────────────────────────────────────────

let allTabs = [];
let duplicateGroups = [];
let lastClosedTabs = [];
let confirmationThreshold = 5;
let userCategories = [];
let closePinnedDuplicates = false;

/** Currently open sub-panel id, or null. */
let activePanel = null;

// ─── Element references ───────────────────────────────────────────────────────

const summaryEl         = document.getElementById('summary');
const undoBanner        = document.getElementById('undo-banner');
const undoText          = document.getElementById('undo-text');
const undoButton        = document.getElementById('undo-button');
const dupBadge          = document.getElementById('dup-badge');
const dupSub            = document.getElementById('dup-sub');

const btnOrganise       = document.getElementById('btn-organise');
const btnCloseCat       = document.getElementById('btn-close-cat');
const btnDuplicates     = document.getElementById('btn-duplicates');
const btnPreset         = document.getElementById('btn-preset');
const btnSave           = document.getElementById('btn-save');
const btnShortcuts      = document.getElementById('btn-shortcuts');
const btnOpenSettings   = document.getElementById('btn-open-settings');
const btnFooterSettings = document.getElementById('btn-footer-settings');
const togglePopups      = document.getElementById('toggle-popups');

const panelCategories   = document.getElementById('panel-categories');
const panelDuplicates   = document.getElementById('panel-duplicates');
const panelPresets      = document.getElementById('panel-presets');
const panelShortcuts    = document.getElementById('panel-shortcuts');

const categoryRowsEl    = document.getElementById('category-rows');
const duplicateDetailEl = document.getElementById('duplicate-detail');
const presetRowsEl      = document.getElementById('preset-rows');
const shortcutRowsEl    = document.getElementById('shortcut-rows');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sendRuntimeMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function showActionError(error, fallbackMessage) {
  console.error(error);
  window.alert(error instanceof Error && error.message ? error.message : fallbackMessage);
}

function getDuplicateGroupSummary(group, closePinnedTabs = false) {
  const { keep, tabsToClose } = planDuplicateTabRemoval(group.tabs, { closePinnedTabs });
  return { ...group, keep, tabsToClose };
}

// ─── Sub-panel toggle ─────────────────────────────────────────────────────────

/**
 * Opens the given panel (closing any other open panel).
 * If the same panel is already open, closes it (toggle behaviour).
 *
 * @param {string} panelId - element id of the panel section
 * @param {string} btnId   - element id of the triggering tile button
 * @param {() => void} [renderFn] - called once when panel opens to fill content
 */
function openPanel(panelId, btnId, renderFn) {
  const panel = document.getElementById(panelId);
  const btn   = document.getElementById(btnId);

  if (activePanel === panelId) {
    // Close
    panel.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    activePanel = null;
    return;
  }

  // Close previous panel if any
  if (activePanel) {
    const prev = document.getElementById(activePanel);
    if (prev) prev.classList.add('hidden');

    // Reset aria-expanded on whichever tile had it
    document.querySelectorAll('[aria-expanded="true"]').forEach((el) => {
      el.setAttribute('aria-expanded', 'false');
    });
  }

  activePanel = panelId;
  panel.classList.remove('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  if (renderFn) renderFn();
}

// Wire close buttons inside sub-panels
document.querySelectorAll('.sub-panel__close').forEach((closeBtn) => {
  closeBtn.addEventListener('click', () => {
    const panelId = closeBtn.dataset.panel;
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('hidden');

    document.querySelectorAll('[aria-expanded="true"]').forEach((el) => {
      el.setAttribute('aria-expanded', 'false');
    });

    if (activePanel === panelId) activePanel = null;
  });
});

// ─── Refresh ──────────────────────────────────────────────────────────────────

async function refreshTabs() {
  const settings = await getSettings();
  confirmationThreshold = settings.confirmationThreshold;

  [allTabs, userCategories] = await Promise.all([
    chrome.tabs.query({}),
    getCategories(),
  ]);

  const {
    enabled: dedupeEnabled = true,
    mode = 'exact',
    ignoreHash,
    ignoreQuery,
  } = settings.duplicateDetection;
  closePinnedDuplicates = settings.duplicateDetection?.closePinnedTabs ?? false;
  duplicateGroups = dedupeEnabled
    ? findDuplicateGroups(allTabs, { mode, ignoreHash, ignoreQuery })
    : [];

  summaryEl.textContent = `${allTabs.length} tab${allTabs.length === 1 ? '' : 's'} open`;

  // Duplicate tile badge
  const removableGroups = duplicateGroups.map((group) =>
    getDuplicateGroupSummary(group, closePinnedDuplicates)
  );
  const dupCount = removableGroups.reduce((sum, group) => sum + group.tabsToClose.length, 0);
  if (dupCount > 0) {
    dupBadge.textContent = dupCount;
    dupBadge.classList.remove('hidden');
    dupSub.textContent = `${dupCount} duplicate tab${dupCount === 1 ? '' : 's'} can be removed`;
  } else if (duplicateGroups.length > 0) {
    dupBadge.classList.add('hidden');
    dupSub.textContent = 'Duplicates found, but protected tabs are kept';
  } else {
    dupBadge.classList.add('hidden');
    dupSub.textContent = 'No duplicates found';
  }

  // Re-render any open panel's content
  if (activePanel === 'panel-categories') renderCategoryRows();
  if (activePanel === 'panel-duplicates') renderDuplicateDetail();
  await loadUndoState();
}

// ─── 1. Organise Tabs ─────────────────────────────────────────────────────────

async function onOrganiseTabs() {
  if (!chrome.tabGroups) {
    window.alert(
      'Tab Groups are not supported in this browser.\n\n' +
        'This feature requires Chrome 89+ or Edge 89+.',
    );
    return;
  }

  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });

    // Build a map from category name → { colour, tabIds }
    const categories = categorizeTabsWithCategories(tabs, userCategories);
    const colourMap = new Map(userCategories.map((c) => [c.name, c.colour]));
    const fallbackColours = ['blue', 'cyan', 'green', 'yellow', 'orange', 'pink', 'purple', 'grey'];
    let colourIdx = 0;

    for (const [name, catTabs] of categories) {
      if (catTabs.length === 0) continue;

      // Skip pinned tabs and internal browser pages — they cannot be grouped.
      const groupableTabs = catTabs.filter(
        (t) => !t.pinned && Number.isInteger(t.id) && !isInternalUrl(t.url),
      );
      if (groupableTabs.length === 0) continue;

      const tabIds = groupableTabs.map((t) => t.id);
      const colour = colourMap.get(name) ?? fallbackColours[colourIdx % fallbackColours.length];

      try {
        const groupId = await chrome.tabs.group({ tabIds });
        await chrome.tabGroups.update(groupId, {
          title: name,
          color: colour,
          collapsed: false,
        });
      } catch {
        // Silently skip any individual group that fails (e.g. edge cases with
        // tabs that cannot be grouped despite passing the filter above).
      }

      colourIdx++;
    }

    await refreshTabs();
  } catch (error) {
    showActionError(error, 'Unable to organise tabs into groups.');
  }
}

// ─── 2. Close by Category ─────────────────────────────────────────────────────

function renderCategoryRows() {
  const categories = categorizeTabsWithCategories(allTabs, userCategories);
  categoryRowsEl.innerHTML = '';
  let anyVisible = false;

  categories.forEach((tabs, categoryName) => {
    if (tabs.length === 0) return;
    anyVisible = true;

    const closable = tabs.filter(isClosableTab).length;
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <span class="cat-row__name">${escapeHtml(categoryName)}</span>
      <span class="cat-row__badge">${tabs.length} tab${tabs.length === 1 ? '' : 's'}</span>
      <button
        class="cat-row__btn"
        type="button"
        ${closable === 0 ? 'disabled' : ''}
        title="${closable === 0 ? 'All tabs here are pinned or active' : `Close ${closable} tab${closable === 1 ? '' : 's'} in ${escapeHtml(categoryName)}`}"
      >Close</button>
    `;
    row.querySelector('button').addEventListener('click', () => onCloseCategory(categoryName, tabs));
    categoryRowsEl.appendChild(row);
  });

  if (!anyVisible) {
    categoryRowsEl.innerHTML = '<p class="panel-empty">No categorised tabs found.</p>';
  }
}

async function onCloseCategory(categoryName, tabs) {
  const closable = tabs.filter(isClosableTab);
  if (closable.length === 0) return;

  const confirmed =
    closable.length <= confirmationThreshold ||
    window.confirm(`Close ${closable.length} tab${closable.length === 1 ? '' : 's'} in "${categoryName}"?`);

  if (!confirmed) return;

  try {
    await closeTabsAndStoreUndo(closable);
    await refreshTabs();
  } catch (error) {
    showActionError(error, 'Unable to close those tabs.');
  }
}

// ─── 3. Delete Duplicate Tabs ─────────────────────────────────────────────────

function renderDuplicateDetail() {
  duplicateDetailEl.innerHTML = '';

  if (duplicateGroups.length === 0) {
    duplicateDetailEl.innerHTML = '<p class="panel-empty">No duplicate tabs found.</p>';
    return;
  }

  const summarizedGroups = duplicateGroups.map((group) =>
    getDuplicateGroupSummary(group, closePinnedDuplicates)
  );
  const totalExtra = summarizedGroups.reduce((sum, group) => sum + group.tabsToClose.length, 0);
  const summaryDiv = document.createElement('p');
  summaryDiv.className = 'dup-summary';
  summaryDiv.innerHTML =
    totalExtra > 0
      ? `Found <strong>${duplicateGroups.length}</strong> duplicate group${duplicateGroups.length === 1 ? '' : 's'}. <strong>${totalExtra}</strong> tab${totalExtra === 1 ? '' : 's'} can be removed.`
      : `Found <strong>${duplicateGroups.length}</strong> duplicate group${duplicateGroups.length === 1 ? '' : 's'}, but only active or pinned tabs remain protected.`;
  duplicateDetailEl.appendChild(summaryDiv);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-delete-all';
  deleteBtn.type = 'button';
  deleteBtn.textContent = `Delete ${totalExtra} duplicate${totalExtra === 1 ? '' : 's'}`;
  deleteBtn.disabled = totalExtra === 0;
  deleteBtn.addEventListener('click', onDeleteDuplicates);
  duplicateDetailEl.appendChild(deleteBtn);

  const list = document.createElement('ul');
  list.className = 'dup-list';
  summarizedGroups.forEach((group) => {
    const li = document.createElement('li');
    li.className = 'dup-item';
    li.innerHTML = `
      <span class="dup-item__url">${escapeHtml(group.label)}</span>
      <span class="dup-item__count">×${group.tabs.length}</span>
      <span class="dup-item__meta">${group.tabsToClose.length} removable</span>
    `;
    list.appendChild(li);
  });
  duplicateDetailEl.appendChild(list);
}

async function onDeleteDuplicates() {
  if (duplicateGroups.length === 0) return;

  const tabsToClose = duplicateGroups.flatMap(
    (group) => getDuplicateGroupSummary(group).tabsToClose
  );

  if (tabsToClose.length === 0) return;

  const confirmed =
    tabsToClose.length <= confirmationThreshold ||
    window.confirm(`Delete ${tabsToClose.length} duplicate tab${tabsToClose.length === 1 ? '' : 's'}?`);

  if (!confirmed) return;

  try {
    await closeTabsAndStoreUndo(tabsToClose);
    await refreshTabs();
  } catch (error) {
    showActionError(error, 'Unable to delete duplicate tabs.');
  }
}

// ─── 4. Open Preset ───────────────────────────────────────────────────────────

async function renderPresets() {
  presetRowsEl.innerHTML = '';

  const presets = await getPresets();
  const withTabs = presets.filter((preset) => preset.tabs.length > 0);

  if (withTabs.length === 0) {
    presetRowsEl.innerHTML =
      '<p class="panel-empty">No presets yet. Create one in TabMate Settings.</p>';
    return;
  }

  withTabs.forEach((preset) => {
    const row = document.createElement('div');
    row.className = 'preset-row';
    row.innerHTML = `
      <div class="preset-row__info">
        <span class="preset-row__name">${escapeHtml(preset.name)}</span>
        <span class="preset-row__count">${preset.tabs.length} tab${preset.tabs.length === 1 ? '' : 's'} · ${preset.openBehavior === 'replaceCurrentTabs' ? 'Replace current tabs' : 'Keep current tabs'}</span>
        ${preset.description ? `<span class="preset-row__description">${escapeHtml(preset.description)}</span>` : ''}
      </div>
      <button class="btn-open-preset ${preset.openBehavior === 'replaceCurrentTabs' ? 'btn-open-preset--replace' : ''}" type="button">${preset.openBehavior === 'replaceCurrentTabs' ? 'Replace' : 'Open'}</button>
    `;
    row.querySelector('button').addEventListener('click', () => onOpenPreset(preset));
    presetRowsEl.appendChild(row);
  });
}

async function onOpenPreset(preset) {
  if (preset.tabs.length === 0) return;

  try {
    if (preset.openBehavior === 'replaceCurrentTabs') {
      const currentTabs = await chrome.tabs.query({ currentWindow: true });
      const tabsToClose = currentTabs.filter((tab) => Number.isInteger(tab.id) && !tab.pinned);
      const confirmed =
        tabsToClose.length === 0 ||
        window.confirm(
          `Open "${preset.name}" and close ${tabsToClose.length} non-pinned tab${tabsToClose.length === 1 ? '' : 's'} first?\n\nPinned tabs will stay open.`
        );

      if (!confirmed) return;

      if (tabsToClose.length > 0) {
        await closeTabsAndStoreUndo(tabsToClose);
      }
    }

    for (const [index, tab] of preset.tabs.entries()) {
      await chrome.tabs.create({ url: tab.url, active: index === 0 });
    }
    await refreshTabs();
  } catch (error) {
    showActionError(error, 'Unable to open preset tabs.');
  }
}

// ─── 5. Save Current Tab ──────────────────────────────────────────────────────

async function onSaveCurrentTab() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
      window.alert('This tab cannot be saved (no accessible URL).');
      return;
    }

    const settings = await getSettings();
    const boards = await getBoards();
    const target =
      boards.find((b) => b.id === settings.defaultBoardId) || boards.find((b) => b.isDefault) || boards[0];

    if (!target) {
      window.alert('No board available to save to.');
      return;
    }

    // savedAt is stored as a Unix timestamp in milliseconds.
    target.tabs.push({ title: activeTab.title || 'Untitled', url: activeTab.url, savedAt: Date.now() });
    await setBoards(boards);

    // Brief visual feedback on the tile itself
    const btn = document.getElementById('btn-save');
    const originalSub = btn ? btn.querySelector('.tile__sub') : null;
    if (originalSub) {
      const originalText = originalSub.textContent;
      originalSub.textContent = `Saved to ${target.name}!`;
      setTimeout(() => { originalSub.textContent = originalText; }, 2000);
    }
  } catch (error) {
    showActionError(error, 'Unable to save the current tab.');
  }
}

// ─── 6. Keyboard Shortcuts ────────────────────────────────────────────────────

async function renderShortcuts() {
  shortcutRowsEl.innerHTML = '';

  try {
    const commands = await chrome.commands.getAll();

    if (!commands || commands.length === 0) {
      shortcutRowsEl.innerHTML = '<p class="panel-empty">No commands registered.</p>';
      return;
    }

    commands.forEach((cmd) => {
      const row = document.createElement('div');
      row.className = 'shortcut-row';
      row.innerHTML = `
        <span class="shortcut-row__label">${escapeHtml(cmd.description || cmd.name)}</span>
        <kbd class="shortcut-row__key">${escapeHtml(cmd.shortcut || 'Not set')}</kbd>
      `;
      shortcutRowsEl.appendChild(row);
    });
  } catch {
    shortcutRowsEl.innerHTML = '<p class="panel-empty">Unable to load shortcuts.</p>';
  }
}

// ─── 7. Pop-ups toggle ────────────────────────────────────────────────────────

async function initPopupsToggle() {
  const settings = await getSettings();
  const enabled = settings.notifications?.enabled ?? true;
  togglePopups.setAttribute('aria-checked', String(enabled));

  togglePopups.addEventListener('click', async () => {
    const current = togglePopups.getAttribute('aria-checked') === 'true';
    const next = !current;
    togglePopups.setAttribute('aria-checked', String(next));

    try {
      const s = await getSettings();
      s.notifications = { ...(s.notifications ?? {}), enabled: next };
      await setSettings(s);
    } catch (error) {
      // Revert optimistic UI update
      togglePopups.setAttribute('aria-checked', String(current));
      console.error(error);
    }
  });
}

// ─── 8. Open Website / Settings ───────────────────────────────────────────────

function openSettings() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    chrome.tabs.create({ url: 'https://tabmate.app', active: true });
  }
}

// ─── Undo ─────────────────────────────────────────────────────────────────────

async function closeTabsAndStoreUndo(tabsToClose) {
  const payload = tabsToClose
    .filter((tab) => Number.isInteger(tab.id) && Boolean(tab.url))
    .map((tab) => ({ id: tab.id, title: tab.title || 'Untitled tab', url: tab.url }));

  if (payload.length === 0) return;

  const response = await sendRuntimeMessage({ type: 'close-tabs', tabs: payload });
  if (!response?.ok) throw new Error(response?.error || 'Unable to close tabs.');

  lastClosedTabs = Array.isArray(response.lastClosedTabs) ? response.lastClosedTabs : [];
  showUndoBanner(response.closedCount || lastClosedTabs.length);
}

async function onUndo() {
  if (lastClosedTabs.length === 0) return;

  try {
    const response = await sendRuntimeMessage({ type: 'restore-tabs' });
    if (!response?.ok) throw new Error(response?.error || 'Unable to restore tabs.');

    lastClosedTabs = [];
    undoBanner.classList.add('hidden');
    await refreshTabs();
  } catch (error) {
    showActionError(error, 'Unable to restore tabs.');
  }
}

async function loadUndoState() {
  lastClosedTabs = await getUndoTabs();
  if (lastClosedTabs.length > 0) {
    showUndoBanner(lastClosedTabs.length);
  } else {
    undoBanner.classList.add('hidden');
  }
}

function showUndoBanner(count) {
  undoText.textContent = `Closed ${count} tab${count === 1 ? '' : 's'}.`;
  undoBanner.classList.remove('hidden');
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    // Wire tile buttons
    btnOrganise.addEventListener('click', onOrganiseTabs);

    btnCloseCat.addEventListener('click', () =>
      openPanel('panel-categories', 'btn-close-cat', renderCategoryRows),
    );

    btnDuplicates.addEventListener('click', () =>
      openPanel('panel-duplicates', 'btn-duplicates', renderDuplicateDetail),
    );

    btnPreset.addEventListener('click', () =>
      openPanel('panel-presets', 'btn-preset', renderPresets),
    );

    btnSave.addEventListener('click', onSaveCurrentTab);

    btnShortcuts.addEventListener('click', () =>
      openPanel('panel-shortcuts', 'btn-shortcuts', renderShortcuts),
    );

    btnOpenSettings.addEventListener('click', openSettings);
    btnFooterSettings.addEventListener('click', openSettings);

    undoButton.addEventListener('click', onUndo);

    await Promise.all([refreshTabs(), initPopupsToggle()]);
  } catch (error) {
    showActionError(error, 'Unable to load TabMate.');
  }
}

init();

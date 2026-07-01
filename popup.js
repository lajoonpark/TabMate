import {
  MAX_VISIBLE_TABS_PER_CATEGORY,
  categorizeTabs,
  findDuplicateGroups,
  isClosableTab,
  selectPreferredTab,
  extractDomain,
  escapeHtml,
} from './lib/utils.js';
import { getUndoTabs, getSettings } from './lib/storage.js';

let allTabs = [];
let duplicates = [];
let lastClosedTabs = [];
let confirmationThreshold = 5;

const summaryEl = document.getElementById('summary');
const categoriesEl = document.getElementById('categories');
const duplicatesEl = document.getElementById('duplicates');
const closeDuplicatesButton = document.getElementById('close-duplicates');
const undoBanner = document.getElementById('undo-banner');
const undoText = document.getElementById('undo-text');
const undoButton = document.getElementById('undo-button');

function sendRuntimeMessage(message) {
  return chrome.runtime.sendMessage(message);
}

function showActionError(error, fallbackMessage) {
  console.error(error);
  window.alert(error instanceof Error && error.message ? error.message : fallbackMessage);
}

// Entry point for popup rendering and event wiring.
async function init() {
  try {
    await refreshTabs();
    closeDuplicatesButton.addEventListener('click', onCloseDuplicates);
    undoButton.addEventListener('click', onUndo);
  } catch (error) {
    showActionError(error, 'Unable to load your tabs.');
  }
}

// Queries all tabs and updates the popup sections, reading settings first.
async function refreshTabs() {
  const settings = await getSettings();
  confirmationThreshold = settings.confirmationThreshold;

  allTabs = await chrome.tabs.query({});
  duplicates = findDuplicateGroups(allTabs, settings.duplicateDetection);

  summaryEl.textContent = `You have ${allTabs.length} open tabs`;

  renderCategories(categorizeTabs(allTabs));
  renderDuplicates(duplicates);
  await loadUndoState();
}

// Creates card UI for each category with tab details and close action.
function renderCategories(categories) {
  categoriesEl.innerHTML = '';

  categories.forEach((tabs, categoryName) => {
    if (tabs.length === 0) return;

    const closableCount = tabs.filter(isClosableTab).length;
    const card = document.createElement('article');
    card.className = 'card';

    card.innerHTML = `
      <div class="card__header">
        <h3 class="category-title">${escapeHtml(categoryName)}</h3>
        <span class="badge">${tabs.length} tabs</span>
      </div>
      <ul class="tab-list">
        ${tabs
          .slice(0, MAX_VISIBLE_TABS_PER_CATEGORY)
          .map((tab) => {
            const domain = extractDomain(tab.url);
            return `<li class="tab-item">
              <span class="tab-title">${escapeHtml(tab.title || 'Untitled tab')}</span>
              <span class="tab-domain">${escapeHtml(domain)}</span>
            </li>`;
          })
          .join('')}
      </ul>
      ${
        tabs.length > MAX_VISIBLE_TABS_PER_CATEGORY
          ? `<p class="small-muted">+${tabs.length - MAX_VISIBLE_TABS_PER_CATEGORY} more tabs</p>`
          : ''
      }
      <button class="danger-button" data-category="${escapeHtml(categoryName)}" type="button" ${
        closableCount === 0 ? 'disabled' : ''
      } title="${
        closableCount === 0 ? 'All tabs here are pinned or currently active' : `Close tabs in ${categoryName}`
      }">Close all</button>
    `;

    card.querySelector('button').addEventListener('click', () => onCloseCategory(categoryName, tabs));
    categoriesEl.appendChild(card);
  });
}

// Renders duplicate URL groups with count and keeps a dedicated cleanup action.
function renderDuplicates(groups) {
  if (groups.length === 0) {
    duplicatesEl.innerHTML = '<p class="small-muted">No duplicate URLs found.</p>';
    closeDuplicatesButton.disabled = true;
    return;
  }

  const list = groups
    .map((group) => {
      const count = group.tabs.length;
      return `<li>
        <span class="duplicate-url">${escapeHtml(group.url)}</span>
        <span class="small-muted">${count} copies</span>
      </li>`;
    })
    .join('');

  duplicatesEl.innerHTML = `<ul class="duplicate-list">${list}</ul>`;
  closeDuplicatesButton.disabled = false;
}

// Handles close-by-category while preserving pinned and active tabs.
async function onCloseCategory(categoryName, tabs) {
  const closableTabs = tabs.filter(isClosableTab);
  if (closableTabs.length === 0) return;

  const shouldClose =
    closableTabs.length <= confirmationThreshold ||
    window.confirm(`Close ${closableTabs.length} tabs in ${categoryName}?`);

  if (!shouldClose) return;

  try {
    await closeTabsAndStoreUndo(closableTabs);
    await refreshTabs();
  } catch (error) {
    showActionError(error, 'Unable to close those tabs.');
  }
}

// Removes duplicate tabs while keeping a single preferred copy for each URL.
async function onCloseDuplicates() {
  if (duplicates.length === 0) return;

  const tabsToClose = [];

  duplicates.forEach((group) => {
    const keepTab = selectPreferredTab(group.tabs);
    if (!keepTab) return;

    group.tabs.forEach((tab) => {
      if (tab.id !== keepTab.id && isClosableTab(tab)) {
        tabsToClose.push(tab);
      }
    });
  });

  if (tabsToClose.length === 0) return;

  const shouldClose =
    tabsToClose.length <= confirmationThreshold ||
    window.confirm(`Close ${tabsToClose.length} duplicate tabs?`);

  if (!shouldClose) return;

  try {
    await closeTabsAndStoreUndo(tabsToClose);
    await refreshTabs();
  } catch (error) {
    showActionError(error, 'Unable to close duplicate tabs.');
  }
}

// Closes tabs via the background service worker and shows undo banner.
async function closeTabsAndStoreUndo(tabsToClose) {
  const tabsPayload = tabsToClose
    .filter((tab) => Number.isInteger(tab.id) && Boolean(tab.url))
    .map((tab) => ({
      id: tab.id,
      title: tab.title || 'Untitled tab',
      url: tab.url,
    }));

  if (tabsPayload.length === 0) return;

  const response = await sendRuntimeMessage({
    type: 'close-tabs',
    tabs: tabsPayload,
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Unable to close tabs.');
  }

  lastClosedTabs = Array.isArray(response.lastClosedTabs) ? response.lastClosedTabs : [];
  showUndoBanner(response.closedCount || lastClosedTabs.length);
}

// Restores last closed tab batch via the background service worker.
async function onUndo() {
  if (lastClosedTabs.length === 0) return;

  try {
    const response = await sendRuntimeMessage({ type: 'restore-tabs' });
    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to restore tabs.');
    }

    lastClosedTabs = [];
    undoBanner.classList.add('hidden');

    await refreshTabs();
  } catch (error) {
    showActionError(error, 'Unable to restore tabs.');
  }
}

// Loads undo state from extension storage so undo survives popup reopen.
async function loadUndoState() {
  lastClosedTabs = await getUndoTabs();

  if (lastClosedTabs.length > 0) {
    showUndoBanner(lastClosedTabs.length);
  } else {
    undoBanner.classList.add('hidden');
  }
}

// Displays the undo banner after a close action.
function showUndoBanner(count) {
  undoText.textContent = `Closed ${count} tabs.`;
  undoBanner.classList.remove('hidden');
}

init();

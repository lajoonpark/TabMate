// Raw URL prefixes/exact matches for browser new-tab and speed dial pages.
const NEW_TAB_URL_PATTERNS = [
  'chrome://newtab/',
  'opera://startpage/',
  'edge://newtab/',
  'about:newtab',
  'about:blank',
];

// Domain rule definitions used to bucket tabs into cleanup categories.
const CATEGORY_RULES = [
  { name: 'Canva', matcher: ({ hostname }) => matchesDomain(hostname, 'canva.com') },
  { name: 'YouTube', matcher: ({ hostname }) => matchesDomain(hostname, 'youtube.com') },
  {
    name: 'Google Docs',
    matcher: ({ hostname }) =>
      ['docs.google.com', 'sheets.google.com', 'slides.google.com'].some((domain) =>
        matchesDomain(hostname, domain)
      ),
  },
  {
    name: 'Coding',
    matcher: ({ hostname }) =>
      ['github.com', 'vercel.com', 'supabase.com', 'stackoverflow.com'].some((domain) =>
        matchesDomain(hostname, domain)
      ),
  },
  {
    name: 'AI Tools',
    matcher: ({ hostname }) =>
      ['chatgpt.com', 'claude.ai', 'gemini.google.com'].some((domain) =>
        matchesDomain(hostname, domain)
      ),
  },
  {
    name: 'Shopping',
    matcher: ({ hostname }) =>
      ['amazon.com', 'trademe.co.nz', 'ebay.com'].some((domain) => matchesDomain(hostname, domain)),
  },
  {
    name: 'Social',
    matcher: ({ hostname }) =>
      ['facebook.com', 'instagram.com', 'reddit.com', 'x.com', 'twitter.com', 'tiktok.com'].some(
        (domain) => matchesDomain(hostname, domain)
      ),
  },
  {
    name: 'Search / Rabbit Holes',
    matcher: ({ hostname, pathname, searchParams }) => {
      if (matchesDomain(hostname, 'google.com') && pathname === '/search') return true;
      if (matchesDomain(hostname, 'bing.com') && pathname === '/search') return true;
      if (matchesDomain(hostname, 'duckduckgo.com') && searchParams.has('q')) return true;
      return false;
    },
  },
  {
    name: 'Work / School',
    matcher: ({ hostname }) =>
      [
        'teams.microsoft.com',
        'office.com',
        'outlook.office.com',
        'sharepoint.com',
        'onedrive.live.com',
        'mail.google.com',
        'calendar.google.com',
        'meet.google.com',
        'zoom.us',
        'notion.so',
        'slack.com',
      ].some((domain) => matchesDomain(hostname, domain)),
  },
  {
    name: 'Entertainment & Streaming',
    matcher: ({ hostname }) =>
      [
        'netflix.com',
        'disneyplus.com',
        'hulu.com',
        'primevideo.com',
        'twitch.tv',
        'spotify.com',
        'soundcloud.com',
        'crunchyroll.com',
      ].some((domain) => matchesDomain(hostname, domain)),
  },
  {
    name: 'News & Reading',
    matcher: ({ hostname }) =>
      [
        'bbc.com',
        'bbc.co.uk',
        'cnn.com',
        'nytimes.com',
        'theguardian.com',
        'medium.com',
        'substack.com',
        'wikipedia.org',
      ].some((domain) => matchesDomain(hostname, domain)),
  },
];

const MAX_VISIBLE_TABS_PER_CATEGORY = 8;
// Maximum number of tabs allowed for one-click close before requiring confirmation.
const CONFIRMATION_THRESHOLD = 5;

let allTabs = [];
let duplicates = [];
let lastClosedTabs = [];

const summaryEl = document.getElementById('summary');
const categoriesEl = document.getElementById('categories');
const duplicatesEl = document.getElementById('duplicates');
const closeDuplicatesButton = document.getElementById('close-duplicates');
const undoBanner = document.getElementById('undo-banner');
const undoText = document.getElementById('undo-text');
const undoButton = document.getElementById('undo-button');

function callChromeApi(apiCall) {
  return new Promise((resolve, reject) => {
    try {
      apiCall((result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(result);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function queryTabs(queryInfo) {
  return callChromeApi((callback) => chrome.tabs.query(queryInfo, callback));
}

function sendRuntimeMessage(message) {
  return callChromeApi((callback) => chrome.runtime.sendMessage(message, callback));
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

// Queries all tabs (required API shape) and updates the popup sections.
async function refreshTabs() {
  allTabs = await queryTabs({});
  duplicates = findDuplicateGroups(allTabs);

  summaryEl.textContent = `You have ${allTabs.length} open tabs`;

  renderCategories(categorizeTabs(allTabs));
  renderDuplicates(duplicates);
  await loadUndoState();
}

// Categorizes each tab by URL hostname/path matching rules, with Other fallback.
function categorizeTabs(tabs) {
  const categories = new Map([['New Tabs', []], ...CATEGORY_RULES.map((rule) => [rule.name, []])]);
  categories.set('Other', []);

  tabs.forEach((tab) => {
    if (isNewTab(tab.url)) {
      categories.get('New Tabs').push(tab);
      return;
    }

    const parsed = parseTabUrl(tab.url);
    if (!parsed) {
      categories.get('Other').push(tab);
      return;
    }

    const matchedRule = CATEGORY_RULES.find((rule) => rule.matcher(parsed));
    const categoryName = matchedRule ? matchedRule.name : 'Other';
    categories.get(categoryName).push(tab);
  });

  return categories;
}

// Returns true if the raw URL is a known browser new-tab or speed dial page.
function isNewTab(url) {
  if (!url) return false;
  return NEW_TAB_URL_PATTERNS.some((pattern) => url === pattern || url.startsWith(pattern));
}

// Safely parses tab URLs and ignores non-http(s) URLs.
function parseTabUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;

    return {
      hostname: parsed.hostname.replace(/^www\./, ''),
      pathname: parsed.pathname,
      searchParams: parsed.searchParams,
    };
  } catch {
    return null;
  }
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

// Finds duplicate tab groups by URL.
function findDuplicateGroups(tabs) {
  const groups = new Map();

  tabs.forEach((tab) => {
    if (!tab.url || !tab.id) return;
    const parsed = parseTabUrl(tab.url);
    if (!parsed) return;

    if (!groups.has(tab.url)) {
      groups.set(tab.url, []);
    }
    groups.get(tab.url).push(tab);
  });

  return [...groups.entries()]
    .filter(([, groupedTabs]) => groupedTabs.length > 1)
    .map(([url, groupedTabs]) => ({ url, tabs: groupedTabs }));
}

// Handles close-by-category while preserving pinned and active tabs.
async function onCloseCategory(categoryName, tabs) {
  const closableTabs = tabs.filter(isClosableTab);
  if (closableTabs.length === 0) return;

  const shouldClose =
    closableTabs.length <= CONFIRMATION_THRESHOLD ||
    window.confirm(`Close ${closableTabs.length} tabs in ${categoryName}?`);

  if (!shouldClose) return;

  try {
    await closeTabsAndStoreUndo(closableTabs);
    await refreshTabs();
  } catch (error) {
    showActionError(error, 'Unable to close those tabs.');
  }
}

// Removes duplicate tabs while keeping a single preferred copy for each duplicate URL.
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
    tabsToClose.length <= CONFIRMATION_THRESHOLD ||
    window.confirm(`Close ${tabsToClose.length} duplicate tabs?`);

  if (!shouldClose) return;

  try {
    await closeTabsAndStoreUndo(tabsToClose);
    await refreshTabs();
  } catch (error) {
    showActionError(error, 'Unable to close duplicate tabs.');
  }
}

// Closes tabs, persists undo payload, and shows undo banner in popup.
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

// Restores last closed tab batch in the same order using tab create calls.
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

// Loads undo state from extension local storage so undo survives popup reopen.
async function loadUndoState() {
  const response = await sendRuntimeMessage({ type: 'get-undo-state' });
  if (!response?.ok) {
    throw new Error(response?.error || 'Unable to load undo state.');
  }

  lastClosedTabs = Array.isArray(response.lastClosedTabs) ? response.lastClosedTabs : [];

  if (lastClosedTabs.length > 0) {
    showUndoBanner(lastClosedTabs.length);
  } else {
    undoBanner.classList.add('hidden');
  }
}

// Determines whether a tab can be safely auto-closed.
function isClosableTab(tab) {
  return Boolean(tab.id) && !tab.pinned && !tab.active;
}

// Displays the undo banner after a close action.
function showUndoBanner(count) {
  undoText.textContent = `Closed ${count} tabs.`;
  undoBanner.classList.remove('hidden');
}

// Picks the tab copy that should be kept when closing duplicates.
function selectPreferredTab(tabs) {
  if (tabs.length === 0) return null;
  return tabs.find((tab) => tab.active) || tabs.find((tab) => tab.pinned) || tabs[0];
}

// Ensures a hostname matches exactly or by subdomain boundary.
function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

// Converts URL to display-friendly domain string.
function extractDomain(url) {
  const parsed = parseTabUrl(url);
  return parsed ? parsed.hostname : 'Non-web tab';
}

// Escapes dynamic text to keep popup rendering safe.
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

init();

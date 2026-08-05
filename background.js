import { initDefaults, getUndoTabs, setUndoTabs, clearUndoTabs, getSettings, setSettings, getBoards, getPresets, getSavedTabs, setSavedTabs, saveTabToBoard } from './lib/storage.js';

// ─── Content-script messaging helpers ────────────────────────────────────────

/**
 * Sends a message to the content script running in the active tab.
 * Silently fails if the tab is not injectable (e.g. chrome://, PDF, restricted).
 *
 * @param {Object} message
 * @returns {Promise<void>}
 */
async function sendToActiveTab(message) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('chrome-extension://')) {
    return;
  }
  await chrome.tabs.sendMessage(tab.id, message).catch(() => {});
}

// ─── Tab watcher — fires helper pop-ups ──────────────────────────────────────

/** Snapshot of tab count from last watcher run */
let lastTabCount = -1;
/** Snapshot of duplicate count from last watcher run */
let lastDupCount = -1;
/** Debounce timer id for watcher */
let watcherTimer = null;

/** Cooldown map: popupId → last-shown timestamp */
const popupShownAt = new Map();
const WATCHER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function canShowPopup(id) {
  const last = popupShownAt.get(id) ?? 0;
  return Date.now() - last > WATCHER_COOLDOWN_MS;
}
function markPopupShown(id) {
  popupShownAt.set(id, Date.now());
}

async function runTabWatcher() {
  try {
    const settings = await getSettings();
    const pn = settings.popupNotifications;
    if (!pn?.enabled) return;

    const tabs = await chrome.tabs.query({});
    const tabCount = tabs.length;
    const position = pn.position ?? 'bottom-left';

    // Many tabs pop-up
    if (
      pn.manyTabsEnabled &&
      tabCount >= (pn.manyTabsThreshold ?? 25) &&
      tabCount !== lastTabCount &&
      canShowPopup('many-tabs')
    ) {
      markPopupShown('many-tabs');
      lastTabCount = tabCount;
      await sendToActiveTab({
        type: 'show-popup',
        popup: {
          id: 'many-tabs',
          text: `You have ${tabCount} tabs open. Want to organise them?`,
          icon: 'info',
          action: { label: 'Organise', message: { type: 'command', command: 'organise-tabs' } },
          position,
        },
      });
      return; // show one popup at a time
    }

    // New tabs pop-up (tab count grew significantly)
    const newTabsThreshold = pn.newTabsThreshold ?? 8;
    if (
      pn.newTabsEnabled &&
      lastTabCount > 0 &&
      tabCount - lastTabCount >= newTabsThreshold &&
      canShowPopup('new-tabs')
    ) {
      const diff = tabCount - lastTabCount;
      markPopupShown('new-tabs');
      lastTabCount = tabCount;
      await sendToActiveTab({
        type: 'show-popup',
        popup: {
          id: 'new-tabs',
          text: `Woah! You have ${diff} new tabs open. Would you like to close them?`,
          icon: 'info',
          action: { label: 'Close new tabs', message: { type: 'command', command: 'delete-duplicates' } },
          position,
        },
      });
      return;
    }

    lastTabCount = tabCount;

    // Duplicates pop-up
    if (pn.duplicatesEnabled) {
      const { findDuplicateGroups } = await import('./lib/utils.js');
      const { mode = 'exact', ignoreHash = true, ignoreQuery = false } = settings.duplicateDetection ?? {};
      const groups = findDuplicateGroups(tabs, { mode, ignoreHash, ignoreQuery });
      const dupCount = groups.reduce((sum, g) => sum + Math.max(0, g.tabs.length - 1), 0);

      if (
        dupCount >= (pn.duplicatesThreshold ?? 3) &&
        dupCount !== lastDupCount &&
        canShowPopup('duplicates')
      ) {
        markPopupShown('duplicates');
        lastDupCount = dupCount;
        await sendToActiveTab({
          type: 'show-popup',
          popup: {
            id: 'duplicates',
            text: `You have ${dupCount} duplicate tab${dupCount === 1 ? '' : 's'}. Clean them up?`,
            icon: 'danger',
            action: { label: 'Clean up', message: { type: 'delete-duplicates' } },
            position,
          },
        });
      } else {
        lastDupCount = dupCount;
      }
    }
  } catch {
    // Watcher should never throw
  }
}

function scheduleWatcher() {
  clearTimeout(watcherTimer);
  watcherTimer = setTimeout(runTabWatcher, 2000);
}

// Listen to tab events to trigger the watcher
chrome.tabs.onCreated.addListener(scheduleWatcher);
chrome.tabs.onRemoved.addListener(scheduleWatcher);
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') scheduleWatcher();
});

// Handle delete-duplicates message from content-script pop-up actions
async function handleDeleteDuplicates() {
  try {
    const { findDuplicateGroups, planDuplicateTabRemoval } = await import('./lib/utils.js');
    const settings = await getSettings();
    const { mode = 'exact', ignoreHash = true, ignoreQuery = false } = settings.duplicateDetection ?? {};
    const tabs = await chrome.tabs.query({});
    const groups = findDuplicateGroups(tabs, { mode, ignoreHash, ignoreQuery });
    const tabsToClose = groups.flatMap((g) => planDuplicateTabRemoval(g.tabs, { closePinnedTabs: false }).tabsToClose);
    if (tabsToClose.length > 0) {
      const payload = tabsToClose.map((t) => ({ title: t.title || 'Untitled tab', url: t.url }));
      await setUndoTabs(payload);
      await chrome.tabs.remove(tabsToClose.map((t) => t.id));
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unexpected error.' };
  }
}

// Seed default categories, presets, boards, and settings on install or update.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install' || reason === 'update') {
    initDefaults().catch(console.error);
  }
});

async function handleCloseTabs(message) {
  const tabsToClose = Array.isArray(message.tabs)
    ? message.tabs.filter((tab) => Number.isInteger(tab.id) && Boolean(tab.url))
    : [];

  if (tabsToClose.length === 0) {
    return { ok: true, closedCount: 0, lastClosedTabs: [] };
  }

  const payload = tabsToClose.map((tab) => ({
    title: tab.title || 'Untitled tab',
    url: tab.url,
  }));

  await setUndoTabs(payload);
  await chrome.tabs.remove(tabsToClose.map((tab) => tab.id));

  return {
    ok: true,
    closedCount: payload.length,
    lastClosedTabs: payload,
  };
}

async function handleRestoreTabs() {
  const lastClosedTabs = await getUndoTabs();

  for (const tab of lastClosedTabs) {
    await chrome.tabs.create({ url: tab.url, active: false });
  }

  await clearUndoTabs();
  return { ok: true, restoredCount: lastClosedTabs.length, lastClosedTabs: [] };
}

async function handleSaveCurrentTab(boardId) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:')) {
    return { ok: false, error: 'Tab cannot be saved.' };
  }

  const settings = await getSettings();
  const targetBoardId = boardId || settings.defaultBoardId || 'unorganised';
  const result = await saveTabToBoard(
    { title: activeTab.title || 'Untitled', url: activeTab.url, faviconUrl: activeTab.favIconUrl || undefined },
    targetBoardId,
  );

  // Fire save animation on the active tab if save was successful
  if (result.ok && settings.popupNotifications?.enabled && settings.popupNotifications?.saveConfirmEnabled) {
    const boards = await getBoards();
    const board = boards.find((b) => b.id === targetBoardId);
    const boardName = board?.name ?? 'board';
    sendToActiveTab({
      type: 'show-save-animation',
      title: activeTab.title || 'Untitled',
      url: activeTab.url,
      faviconUrl: activeTab.favIconUrl || undefined,
      boardName,
    }).catch(() => {});
  }

  return result;
}

async function handleOpenPreset(presetId) {
  const presets = await getPresets();
  const preset = presets.find((p) => p.id === presetId);
  if (!preset || preset.tabs.length === 0) return { ok: false, error: 'Preset not found or empty.' };

  for (const [index, tab] of preset.tabs.entries()) {
    await chrome.tabs.create({ url: tab.url, active: index === 0 });
  }
  return { ok: true };
}

async function handleTogglePopups() {
  const settings = await getSettings();
  const next = !(settings.notifications?.enabled ?? true);
  settings.notifications = { ...(settings.notifications ?? {}), enabled: next };
  await setSettings(settings);
  return { ok: true, enabled: next };
}

// ─── Extension command handler ────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === 'organise-tabs') {
      // Organise tabs into groups — open the popup or send a message to any open popup
      await chrome.runtime.sendMessage({ type: 'command', command: 'organise-tabs' }).catch(() => {});
    } else if (command === 'delete-duplicates') {
      await chrome.runtime.sendMessage({ type: 'command', command: 'delete-duplicates' }).catch(() => {});
    } else if (command === 'save-current-tab') {
      await handleSaveCurrentTab(null);
    } else if (command === 'toggle-popups') {
      await handleTogglePopups();
    } else if (command === 'open-preset-1') {
      const settings = await getSettings();
      const presetId = settings.shortcutSlots?.presetSlot1;
      if (presetId) await handleOpenPreset(presetId);
    } else if (command === 'save-to-board-1') {
      const settings = await getSettings();
      const boardId = settings.shortcutSlots?.boardSlot1;
      if (boardId) await handleSaveCurrentTab(boardId);
    } else if (command === 'save-to-board-2') {
      const settings = await getSettings();
      const boardId = settings.shortcutSlots?.boardSlot2;
      if (boardId) await handleSaveCurrentTab(boardId);
    } else if (command === 'save-to-board-3') {
      const settings = await getSettings();
      const boardId = settings.shortcutSlots?.boardSlot3;
      if (boardId) await handleSaveCurrentTab(boardId);
    }
  } catch (error) {
    console.error('TabMate command error:', error);
  }
});

// ─── Runtime message handler ──────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let action;

  if (message?.type === 'close-tabs') {
    action = handleCloseTabs(message);
  } else if (message?.type === 'restore-tabs') {
    action = handleRestoreTabs();
  } else if (message?.type === 'save-current-tab') {
    action = handleSaveCurrentTab(message.boardId ?? null);
  } else if (message?.type === 'toggle-popups') {
    action = handleTogglePopups();
  } else if (message?.type === 'delete-duplicates') {
    action = handleDeleteDuplicates();
  } else {
    action = Promise.resolve({ ok: false, error: 'Unknown message type.' });
  }

  action
    .then((response) => sendResponse(response))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : 'Unexpected extension error.',
      })
    );

  return true;
});

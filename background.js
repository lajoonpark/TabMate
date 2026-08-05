import { initDefaults, getUndoTabs, setUndoTabs, clearUndoTabs, getSettings, setSettings, getBoards, getPresets, getSavedTabs, setSavedTabs, saveTabToBoard } from './lib/storage.js';

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

import { initDefaults, getUndoTabs, setUndoTabs, clearUndoTabs } from './lib/storage.js';

// Seed default categories, boards, and settings on first install.
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action =
    message?.type === 'close-tabs'
      ? handleCloseTabs(message)
      : message?.type === 'restore-tabs'
        ? handleRestoreTabs()
        : Promise.resolve({ ok: false, error: 'Unknown message type.' });

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

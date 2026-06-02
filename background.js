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

function getStoredUndoTabs() {
  return callChromeApi((callback) => chrome.storage.local.get(['lastClosedTabs'], callback)).then(
    (result) => (Array.isArray(result.lastClosedTabs) ? result.lastClosedTabs : [])
  );
}

function setStoredUndoTabs(tabs) {
  return callChromeApi((callback) => chrome.storage.local.set({ lastClosedTabs: tabs }, callback));
}

function clearStoredUndoTabs() {
  return callChromeApi((callback) => chrome.storage.local.remove(['lastClosedTabs'], callback));
}

function removeTabs(tabIds) {
  return callChromeApi((callback) => chrome.tabs.remove(tabIds, callback));
}

function createTab(url) {
  return callChromeApi((callback) => chrome.tabs.create({ url, active: false }, callback));
}

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

  await setStoredUndoTabs(payload);
  await removeTabs(tabsToClose.map((tab) => tab.id));

  return {
    ok: true,
    closedCount: payload.length,
    lastClosedTabs: payload,
  };
}

async function handleRestoreTabs() {
  const lastClosedTabs = await getStoredUndoTabs();

  for (const tab of lastClosedTabs) {
    await createTab(tab.url);
  }

  await clearStoredUndoTabs();
  return { ok: true, restoredCount: lastClosedTabs.length, lastClosedTabs: [] };
}

async function handleGetUndoState() {
  const lastClosedTabs = await getStoredUndoTabs();
  return { ok: true, lastClosedTabs };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const action =
    message?.type === 'close-tabs'
      ? handleCloseTabs(message)
      : message?.type === 'restore-tabs'
        ? handleRestoreTabs()
        : message?.type === 'get-undo-state'
          ? handleGetUndoState()
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

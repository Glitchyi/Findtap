/** @type {Map<number, boolean>} */
const cssInjectedTabs = new Map();

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-palette') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE' }, () => {
    void chrome.runtime.lastError;
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'OPEN_SHORTCUTS') {
    // chrome:// URLs can only be opened from the background context.
    // Firefox uses moz-extension:// scheme and has no shortcuts deep-link —
    // best we can do is open about:addons (the parent page).
    const isFirefox = chrome.runtime.getURL('').startsWith('moz-extension://');
    const url = isFirefox ? 'about:addons' : 'chrome://extensions/shortcuts';
    chrome.tabs.create({ url }, () => {
      // Swallow any error (e.g. policy-blocked) and tell the options page
      // whether we succeeded so it can fall back to clipboard if needed.
      const failed = !!chrome.runtime.lastError;
      sendResponse({ failed });
    });
    return true; // async sendResponse
  }

  if (msg.action !== 'INJECT_CSS') return;
  const tabId = sender.tab?.id;
  if (!tabId) { sendResponse({}); return; }

  if (cssInjectedTabs.get(tabId)) {
    sendResponse({});
    return;
  }

  chrome.scripting.insertCSS({
    target: { tabId },
    files: ['styles/overlay.css'],
  }).then(() => {
    cssInjectedTabs.set(tabId, true);
    sendResponse({});
  }).catch(() => sendResponse({}));

  return true; // keep channel open for async sendResponse
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    cssInjectedTabs.delete(tabId);
  }
});

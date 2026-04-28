const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_ENTER_SELECTS_FIRST = true;

async function load() {
  const stored = await chrome.storage.sync.get(['maxResults', 'enterSelectsFirst']);

  document.getElementById('maxResults').value =
    typeof stored.maxResults === 'number' ? stored.maxResults : DEFAULT_MAX_RESULTS;

  document.getElementById('enterSelectsFirst').checked =
    stored.enterSelectsFirst !== undefined ? stored.enterSelectsFirst : DEFAULT_ENTER_SELECTS_FIRST;

  // Show current shortcut
  const commands = await chrome.commands.getAll();
  const cmd = commands.find(c => c.name === 'toggle-palette');
  document.getElementById('shortcut-display').textContent = cmd?.shortcut || 'Not set';
}

async function save() {
  const raw = parseInt(document.getElementById('maxResults').value, 10);
  const maxResults = Math.min(10, Math.max(3, isNaN(raw) ? DEFAULT_MAX_RESULTS : raw));
  const enterSelectsFirst = document.getElementById('enterSelectsFirst').checked;

  await chrome.storage.sync.set({ maxResults, enterSelectsFirst });

  const status = document.getElementById('status');
  status.textContent = 'Saved.';
  setTimeout(() => { status.textContent = ''; }, 1500);
}

// Detect Firefox by extension URL scheme
const isFirefox = chrome.runtime.getURL('').startsWith('moz-extension://');

// Open the shortcuts page via the background service worker —
// chrome:// and about: URLs can only be navigated from the background context.
// Firefox has no shortcuts deep-link so we open about:addons instead.
document.getElementById('shortcuts-btn').addEventListener('click', async () => {
  const btn = document.getElementById('shortcuts-btn');
  const origHTML = btn.innerHTML;

  try {
    const resp = await chrome.runtime.sendMessage({ action: 'OPEN_SHORTCUTS' });

    if (resp?.failed) {
      // Tab creation was blocked (policy or unsupported URL) — fall back
      throw new Error('tab creation failed');
    }

    if (isFirefox) {
      // about:addons opened but shortcuts aren't on the landing page — guide the user
      btn.textContent = 'Opened Add-ons — choose ⚙ → Manage Extension Shortcuts';
      setTimeout(() => { btn.innerHTML = origHTML; }, 3500);
    }
  } catch {
    // Background didn't respond or tab creation failed — clipboard fallback
    const fallbackUrl = isFirefox ? 'about:addons' : 'chrome://extensions/shortcuts';
    try {
      await navigator.clipboard.writeText(fallbackUrl);
      btn.textContent = isFirefox
        ? 'Copied about:addons — paste in address bar'
        : 'Copied — paste in address bar';
      setTimeout(() => { btn.innerHTML = origHTML; }, 2500);
    } catch { /* clipboard also denied — nothing to do */ }
  }
});

document.getElementById('save').addEventListener('click', save);

// Auto-save toggle immediately on flip
document.getElementById('enterSelectsFirst').addEventListener('change', save);

// Update button label to match browser
if (isFirefox) {
  const btn = document.getElementById('shortcuts-btn');
  const textNode = btn.lastChild;
  if (textNode) textNode.textContent = 'Open Add-ons page';
}

load();

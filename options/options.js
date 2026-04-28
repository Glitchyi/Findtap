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

// Open chrome://extensions/shortcuts via the background service worker —
// chrome:// URLs can only be navigated from the background context.
document.getElementById('shortcuts-btn').addEventListener('click', async () => {
  const btn = document.getElementById('shortcuts-btn');
  try {
    await chrome.runtime.sendMessage({ action: 'OPEN_SHORTCUTS' });
  } catch {
    // Background didn't respond — fall back to clipboard
    try {
      await navigator.clipboard.writeText('chrome://extensions/shortcuts');
      const orig = btn.innerHTML;
      btn.textContent = 'Copied — paste in address bar';
      setTimeout(() => { btn.innerHTML = orig; }, 2500);
    } catch { /* clipboard also denied — nothing to do */ }
  }
});

document.getElementById('save').addEventListener('click', save);

// Auto-save toggle immediately on flip
document.getElementById('enterSelectsFirst').addEventListener('change', save);

load();

const DEFAULT_MAX_RESULTS = 5;

async function load() {
  // Load maxResults
  const { maxResults = DEFAULT_MAX_RESULTS } = await chrome.storage.sync.get('maxResults');
  document.getElementById('maxResults').value = maxResults;

  // Show current shortcut
  const commands = await chrome.commands.getAll();
  const cmd = commands.find(c => c.name === 'toggle-palette');
  const display = document.getElementById('shortcut-display');
  display.textContent = cmd?.shortcut || 'Not set';
}

async function save() {
  const raw = parseInt(document.getElementById('maxResults').value, 10);
  const maxResults = Math.min(10, Math.max(3, isNaN(raw) ? DEFAULT_MAX_RESULTS : raw));
  await chrome.storage.sync.set({ maxResults });
  const status = document.getElementById('status');
  status.textContent = 'Saved.';
  setTimeout(() => { status.textContent = ''; }, 1500);
}

// The shortcuts page can't be opened via chrome.tabs.create from an extension,
// so copy the URL to clipboard and instruct the user.
document.getElementById('shortcuts-link').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    await navigator.clipboard.writeText('chrome://extensions/shortcuts');
    const link = e.target;
    link.textContent = 'Copied! Paste in address bar';
    setTimeout(() => { link.textContent = 'chrome://extensions/shortcuts'; }, 2000);
  } catch {
    // clipboard denied — just show the URL as-is so user can copy manually
  }
});

document.getElementById('save').addEventListener('click', save);
load();

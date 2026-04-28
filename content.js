import { collectSemanticCandidates, mergeFallbackCandidates } from './collector.js';
import { score } from './fuzzy.js';
import { mount, unmount, render, reposition } from './overlay.js';
import { apply, clear } from './highlighter.js';
import { dispatch } from './dispatcher.js';

/** @type {'INACTIVE'|'ACTIVE'} */
let state = 'INACTIVE';
let maxResults = 5;
let enterSelectsFirst = true;
let candidates = [];
let rankedCandidates = [];
let debounceTimer = null;
let observer = null;
let mutationRafPending = false;

// Bound listener references for removal
let boundKeydown, boundResize, boundScroll, boundPointerdown, boundListenerMap;

chrome.runtime.onMessage.addListener((msg) => {
  console.log('[FindTap] message received:', msg.action, '| current state:', state);
  if (msg.action === 'TOGGLE') {
    if (state === 'INACTIVE') activate();
    else deactivate();
  }
});

async function activate() {
  if (state === 'ACTIVE') return;
  console.log('[FindTap] activating…');
  state = 'ACTIVE';

  try {
    const stored = await chrome.storage.sync.get(['maxResults', 'enterSelectsFirst']);
    maxResults = (typeof stored.maxResults === 'number') ? stored.maxResults : 5;
    enterSelectsFirst = stored.enterSelectsFirst !== undefined ? stored.enterSelectsFirst : true;
    console.log('[FindTap] maxResults:', maxResults);

    await chrome.runtime.sendMessage({ action: 'INJECT_CSS' });
    console.log('[FindTap] CSS injected');

    const inputEl = mount();
    console.log('[FindTap] palette mounted, input:', inputEl);

    boundKeydown = handleKeydown;
    boundResize = () => reposition();
    boundScroll = () => reposition();
    boundPointerdown = handlePointerdown;

    document.addEventListener('keydown', boundKeydown, { capture: true });
    window.addEventListener('resize', boundResize);
    window.addEventListener('scroll', boundScroll, { passive: true });
    document.addEventListener('pointerdown', boundPointerdown, { capture: true });

    inputEl.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => handleInput(inputEl.value), 150);
    });

    inputEl.focus();

    setupMutationObserver();
    await collectAndRender('');
  } catch (err) {
    console.error('[FindTap] activate error:', err);
    clear();
    unmount();
    teardownMutationObserver();
    removeListeners();
    state = 'INACTIVE';
  }
}

function deactivate() {
  if (state === 'INACTIVE') return;
  clear();
  unmount();
  teardownMutationObserver();
  clearTimeout(debounceTimer);
  removeListeners();
  candidates = [];
  rankedCandidates = [];
  state = 'INACTIVE';
}

function handleKeydown(e) {
  e.stopPropagation();

  if (e.key === 'Escape') {
    deactivate();
    return;
  }

  if (e.key === 'Enter' && enterSelectsFirst && rankedCandidates.length > 0) {
    e.preventDefault();
    const target = rankedCandidates[0];
    clear();
    unmount();
    teardownMutationObserver();
    removeListeners();
    candidates = [];
    rankedCandidates = [];
    state = 'INACTIVE';
    dispatch(target.el);
    return;
  }

  const num = parseInt(e.key, 10);
  if (!isNaN(num) && num >= 1 && num <= rankedCandidates.length) {
    e.preventDefault();
    const target = rankedCandidates[num - 1];
    clear();
    unmount();
    teardownMutationObserver();
    removeListeners();
    candidates = [];
    rankedCandidates = [];
    state = 'INACTIVE';
    dispatch(target.el);
  }
}

function handlePointerdown(e) {
  const root = document.getElementById('findtap-root');
  if (root && !root.contains(e.target)) {
    deactivate();
  }
}

function handleInput(query) {
  clear();

  let scored;
  if (!query.trim()) {
    scored = candidates.slice(0, maxResults).map(c => ({ ...c, _score: 0 }));
  } else {
    scored = candidates
      .map(c => ({ ...c, _score: score(query, c.text) }))
      .filter(c => c._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, maxResults);
  }

  rankedCandidates = scored;
  render(rankedCandidates);
  apply(rankedCandidates);
}

async function collectAndRender(query) {
  candidates = collectSemanticCandidates(maxResults);
  console.log('[FindTap] collected', candidates.length, 'candidates');

  // Tear down any previous listener that wasn't resolved before this call
  // (can happen when MutationObserver fires collectAndRender rapidly)
  if (boundListenerMap) {
    document.removeEventListener('findtap:listenerMap', boundListenerMap);
    boundListenerMap = null;
  }

  // Request fallback from injected.js (MAIN world)
  boundListenerMap = (e) => {
    // e.detail may be null if the event was fired without a payload
    // (spec default, Figma race, or stale listener) — guard with ?.
    candidates = mergeFallbackCandidates(candidates, e.detail?.elements || []);
    handleInput(query);
    document.removeEventListener('findtap:listenerMap', boundListenerMap);
    boundListenerMap = null;
  };
  document.addEventListener('findtap:listenerMap', boundListenerMap);
  document.dispatchEvent(new CustomEvent('findtap:requestListeners'));

  // Fallback: if injected.js doesn't respond within 50ms, render with semantic only
  setTimeout(() => {
    if (boundListenerMap) {
      document.removeEventListener('findtap:listenerMap', boundListenerMap);
      boundListenerMap = null;
      handleInput(query);
    }
  }, 50);
}

function setupMutationObserver() {
  observer = new MutationObserver((mutations) => {
    if (mutationRafPending || state !== 'ACTIVE') return;
    // Ignore mutations originating from our own overlay
    const root = document.getElementById('findtap-root');
    if (root && mutations.every(m => root.contains(m.target))) return;
    mutationRafPending = true;
    requestAnimationFrame(async () => {
      mutationRafPending = false;
      if (state !== 'ACTIVE') return;
      const input = document.getElementById('findtap-input');
      const query = input ? input.value : '';
      await collectAndRender(query);
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function teardownMutationObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  mutationRafPending = false;
}

function removeListeners() {
  if (boundKeydown) document.removeEventListener('keydown', boundKeydown, { capture: true });
  if (boundPointerdown) document.removeEventListener('pointerdown', boundPointerdown, { capture: true });
  if (boundResize) window.removeEventListener('resize', boundResize);
  if (boundScroll) window.removeEventListener('scroll', boundScroll);
  if (boundListenerMap) {
    document.removeEventListener('findtap:listenerMap', boundListenerMap);
    boundListenerMap = null;
  }
  boundKeydown = boundResize = boundScroll = boundPointerdown = null;
}

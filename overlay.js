/** @type {HTMLElement|null} */
let root = null;

/** @type {HTMLElement|null} */
let hintLayer = null;

/** @type {HTMLInputElement|null} */
let input = null;

/** @type {HTMLElement[]} */
let badges = [];

/** @type {Array<{el: Element}>} */
let currentCandidates = [];

/**
 * @returns {HTMLInputElement}
 */
export function mount() {
  root = document.createElement('div');
  root.id = 'findtap-root';

  const palette = document.createElement('div');
  palette.id = 'findtap-palette';

  input = document.createElement('input');
  input.id = 'findtap-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = 'Search…';

  palette.appendChild(input);
  root.appendChild(palette);
  document.body.appendChild(root);

  // Separate layer just for hint badges — keeps them independent of the palette
  hintLayer = document.createElement('div');
  hintLayer.id = 'findtap-hint-layer';
  document.body.appendChild(hintLayer);

  return input;
}

/**
 * @param {Array<{el: Element, text: string}>} rankedCandidates
 */
export function render(rankedCandidates) {
  _clearBadges();
  currentCandidates = rankedCandidates;

  for (let i = 0; i < rankedCandidates.length; i++) {
    const { el } = rankedCandidates[i];
    try {
      const rect = el.getBoundingClientRect();

      // Skip elements with no size or outside the viewport
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      if (rect.right < 0 || rect.left > window.innerWidth) continue;

      const badge = document.createElement('div');
      badge.className = 'findtap-hint';
      badge.dataset.index = String(i + 1);
      badge.textContent = String(i + 1);
      // hintLayer is position:fixed so rect coords are already viewport-relative —
      // do NOT add scroll offsets here
      badge.style.top = rect.top + 'px';
      badge.style.left = rect.left + 'px';

      hintLayer.appendChild(badge);
      badges.push(badge);
    } catch { /* element may be detached */ }
  }
}

/**
 * Recomputes badge positions from live getBoundingClientRect.
 * Called on resize and scroll.
 */
export function reposition() {
  for (let i = 0; i < badges.length; i++) {
    const candidate = currentCandidates[i];
    if (!candidate) continue;
    try {
      const rect = candidate.el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      badges[i].style.top = rect.top + 'px';
      badges[i].style.left = rect.left + 'px';
    } catch { /* element may be detached */ }
  }
}

/**
 * Removes #findtap-root from DOM.
 */
export function unmount() {
  if (root && root.parentNode) root.parentNode.removeChild(root);
  if (hintLayer && hintLayer.parentNode) hintLayer.parentNode.removeChild(hintLayer);
  root = null;
  hintLayer = null;
  input = null;
  badges = [];
  currentCandidates = [];
}

function _clearBadges() {
  for (const badge of badges) {
    try {
      if (badge.parentNode) badge.parentNode.removeChild(badge);
    } catch { /* already removed */ }
  }
  badges = [];
}

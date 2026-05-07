const SEMANTIC_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="treeitem"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

const MODAL_SELECTORS = [
  'dialog[open]',
  '[aria-modal="true"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
].join(', ');

const MIN_CLICKABLE_DIMENSION = 8;
const MIN_CLICKABLE_AREA = 400;

/**
 * @param {Element} el
 * @returns {boolean}
 */
function isFindTapElement(el) {
  return Boolean(el.closest?.('#findtap-root'));
}

/**
 * @param {Element} el
 * @returns {DOMRect|null}
 */
function getUsableRect(el) {
  try {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return rect;
  } catch {
    return null;
  }
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
function isRendered(el) {
  try {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return Boolean(getUsableRect(el));
  } catch {
    return false;
  }
}

/**
 * @param {Element} el
 * @returns {number}
 */
function getStackScore(el) {
  const zIndex = Number.parseInt(getComputedStyle(el).zIndex, 10);
  let score = Number.isFinite(zIndex) ? zIndex : 0;
  if (el.matches('dialog[open]')) score += 3000;
  if (el.getAttribute('aria-modal') === 'true') score += 2000;
  if (el.matches('[role="dialog"], [role="alertdialog"]')) score += 1000;
  return score;
}

/**
 * @param {DOMRect} rect
 * @returns {Array<{x: number, y: number}>}
 */
function getProbePoints(rect) {
  const left = Math.max(0, rect.left);
  const right = Math.min(window.innerWidth - 1, rect.right);
  const top = Math.max(0, rect.top);
  const bottom = Math.min(window.innerHeight - 1, rect.bottom);
  const insetX = Math.min(6, Math.max(1, (right - left) / 2));
  const insetY = Math.min(6, Math.max(1, (bottom - top) / 2));

  return [
    { x: left + (right - left) / 2, y: top + (bottom - top) / 2 },
    { x: left + insetX, y: top + insetY },
    { x: right - insetX, y: top + insetY },
    { x: left + insetX, y: bottom - insetY },
    { x: right - insetX, y: bottom - insetY },
  ];
}

/**
 * @param {Element} el
 * @param {{x: number, y: number}} point
 * @returns {boolean}
 */
function pointHitsElement(el, point) {
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= window.innerWidth ||
    point.y >= window.innerHeight
  ) {
    return false;
  }

  const top = document.elementFromPoint(point.x, point.y);
  return Boolean(top && (top === el || el.contains(top)));
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isTopmostCandidate(el) {
  const rect = getUsableRect(el);
  if (!rect) return false;
  return getProbePoints(rect).some(point => pointHitsElement(el, point));
}

/**
 * @returns {Element|null}
 */
export function getActiveModalScope() {
  const modals = Array.from(document.querySelectorAll(MODAL_SELECTORS))
    .filter(el => !isFindTapElement(el))
    .filter(isRendered)
    .filter(el => isInViewport(el))
    .filter(el => isTopmostCandidate(el));

  if (modals.length === 0) return null;

  const sortedModals = modals
    .map((el, index) => ({ el, index, score: getStackScore(el) }))
    .sort((a, b) => a.score - b.score || a.index - b.index);

  return sortedModals[sortedModals.length - 1].el;
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isVisible(el) {
  try {
    if (isFindTapElement(el)) return false;
    if (el.offsetParent === null) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = el.getBoundingClientRect();
    return (
      rect.width >= MIN_CLICKABLE_DIMENSION &&
      rect.height >= MIN_CLICKABLE_DIMENSION &&
      rect.width * rect.height >= MIN_CLICKABLE_AREA
    );
  } catch {
    return false;
  }
}

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isInViewport(el) {
  try {
    const rect = el.getBoundingClientRect();
    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  } catch {
    return false;
  }
}

/**
 * @param {Element} el
 * @returns {string|null}
 */
export function extractText(el) {
  const candidates = [
    el.innerText,
    el.getAttribute('aria-label'),
    el.getAttribute('placeholder'),
    el.getAttribute('title'),
    el.value,
    el.querySelector('img')?.getAttribute('alt'),
    el.getAttribute('name'),
  ];

  for (const c of candidates) {
    const trimmed = typeof c === 'string' ? c.trim() : null;
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * @param {number} maxResults
 * @returns {Array<{el: Element, text: string, origin: 'viewport'|'page'}>}
 */
export function collectSemanticCandidates(maxResults) {
  const activeModal = getActiveModalScope();
  const queryRoot = activeModal ?? document;
  const all = Array.from(queryRoot.querySelectorAll(SEMANTIC_SELECTORS));
  const seen = new Set();
  const results = [];

  // Pass 1: viewport only
  for (const el of all) {
    if (!isVisible(el) || !isInViewport(el)) continue;
    if (!isTopmostCandidate(el)) continue;
    const text = extractText(el);
    if (!text) continue;
    seen.add(el);
    results.push({ el, text, origin: 'viewport' });
  }

  // Pass 2: full page if viewport count < maxResults
  if (results.length < maxResults) {
    for (const el of all) {
      if (seen.has(el)) continue;
      if (!isVisible(el)) continue;
      if (isInViewport(el) && !isTopmostCandidate(el)) continue;
      const text = extractText(el);
      if (!text) continue;
      seen.add(el);
      results.push({ el, text, origin: 'page' });
    }
  }

  return results;
}

/**
 * @param {Array<{el: Element, text: string, origin: string}>} semanticCandidates
 * @param {Element[]} fallbackEls
 * @returns {Array<{el: Element, text: string, origin: string}>}
 */
export function mergeFallbackCandidates(semanticCandidates, fallbackEls) {
  const semanticSet = new Set(semanticCandidates.map(c => c.el));
  const merged = [...semanticCandidates];
  const activeModal = getActiveModalScope();

  for (const el of (fallbackEls ?? [])) {
    if (semanticSet.has(el)) continue;
    if (activeModal && !activeModal.contains(el)) continue;
    if (!isVisible(el)) continue;
    if (isInViewport(el) && !isTopmostCandidate(el)) continue;
    const text = extractText(el);
    if (!text) continue;
    merged.push({ el, text, origin: 'fallback' });
  }

  return merged;
}

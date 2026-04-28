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

/**
 * @param {Element} el
 * @returns {boolean}
 */
export function isVisible(el) {
  try {
    if (el.offsetParent === null) return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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
  const all = Array.from(document.querySelectorAll(SEMANTIC_SELECTORS));
  const seen = new Set();
  const results = [];

  // Pass 1: viewport only
  for (const el of all) {
    if (!isVisible(el) || !isInViewport(el)) continue;
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

  for (const el of (fallbackEls ?? [])) {
    if (semanticSet.has(el)) continue;
    if (!isVisible(el)) continue;
    const text = extractText(el);
    if (!text) continue;
    merged.push({ el, text, origin: 'fallback' });
  }

  return merged;
}

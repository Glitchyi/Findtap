/** @type {Element[]} */
let activeElements = [];

/**
 * @param {Array<{el: Element}>} candidates
 */
export function apply(candidates) {
  clear();
  for (let i = 0; i < candidates.length; i++) {
    const { el } = candidates[i];
    try {
      el.classList.add('findtap-active');
      if (i === 0) el.classList.add('findtap-active-primary');
      activeElements.push(el);
    } catch { /* element may be detached */ }
  }
}

/**
 * Removes findtap-active from all tracked elements.
 * Must be called before every apply(), on dismiss, on click, and on any error path.
 */
export function clear() {
  for (const el of activeElements) {
    try {
      el.classList.remove('findtap-active', 'findtap-active-primary');
    } catch { /* element may be detached */ }
  }
  activeElements = [];
}

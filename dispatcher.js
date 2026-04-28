/**
 * @param {Element} el
 * @returns {Promise<void>}
 */
export async function dispatch(el) {
  try {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus();
    el.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    // Remove focus so the page looks untouched after the click
    try { document.activeElement?.blur(); } catch { /* ignore */ }
  } catch {
    try {
      el.click();
    } catch { /* element no longer in DOM */ }
  }
}

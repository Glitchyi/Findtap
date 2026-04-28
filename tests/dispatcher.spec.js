import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => `file://${path.join(__dir, 'fixtures', name)}`;

test.describe('dispatcher', () => {
  test('dispatchEvent fires click on a button', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    const clicked = await page.evaluate(() => {
      const btn = document.getElementById('btn-submit');
      let fired = false;
      btn.addEventListener('click', () => { fired = true; });
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return fired;
    });
    expect(clicked).toBe(true);
  });

  test('dispatchEvent fires click on delegated SPA element', async ({ page }) => {
    await page.goto(fixture('spa-delegate.html'));
    const action = await page.evaluate(() => {
      const span = document.querySelector('[data-action="open"]');
      span.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return window.__lastAction;
    });
    expect(action).toBe('open');
  });

  test('dispatch does not throw when element is detached', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    const result = await page.evaluate(() => {
      const btn = document.createElement('button');
      btn.textContent = 'Ghost';
      // Don't attach to DOM — detached element
      try {
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        return 'ok';
      } catch {
        return 'threw';
      }
    });
    expect(result).toBe('ok');
  });
});

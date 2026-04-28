import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => `file://${path.join(__dir, 'fixtures', name)}`;

// These tests simulate the keyboard contract without loading the full extension.
// Extension integration tests require a loaded extension context (see Playwright docs).

test.describe('keyboard contract (simulated)', () => {
  test('pressing Escape dismisses palette', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    await page.evaluate(() => {
      const root = document.createElement('div');
      root.id = 'findtap-root';
      const palette = document.createElement('div');
      palette.id = 'findtap-palette';
      root.appendChild(palette);
      document.body.appendChild(root);

      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') {
          root.remove();
          document.removeEventListener('keydown', handler);
        }
      }, { capture: true });
    });

    expect(await page.locator('#findtap-root').count()).toBe(1);
    await page.keyboard.press('Escape');
    expect(await page.locator('#findtap-root').count()).toBe(0);
  });

  test('pressing 1 dispatches click on first candidate', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    await page.evaluate(() => {
      const btn = document.getElementById('btn-submit');
      window.__clicked = false;
      btn.addEventListener('click', () => { window.__clicked = true; });

      // Simulate palette with btn as candidate[0]
      const candidates = [{ el: btn }];
      document.addEventListener('keydown', function handler(e) {
        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= candidates.length) {
          e.preventDefault();
          candidates[num - 1].el.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true, view: window })
          );
          document.removeEventListener('keydown', handler, { capture: true });
        }
      }, { capture: true });
    });

    await page.keyboard.press('1');
    const clicked = await page.evaluate(() => window.__clicked);
    expect(clicked).toBe(true);
  });
});

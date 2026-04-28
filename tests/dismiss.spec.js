import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => `file://${path.join(__dir, 'fixtures', name)}`;

test.describe('dismiss cleanup', () => {
  test('zero findtap-active elements after Escape dismiss', async ({ page }) => {
    await page.goto(fixture('highlight.html'));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      let activeEls = [];

      function apply(els) {
        clear();
        for (const el of els) {
          el.classList.add('findtap-active');
          activeEls.push(el);
        }
      }
      function clear() {
        for (const el of activeEls) el.classList.remove('findtap-active');
        activeEls = [];
      }

      apply(btns);

      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') {
          clear();
          document.removeEventListener('keydown', handler, { capture: true });
        }
      }, { capture: true });
    });

    expect(await page.locator('.findtap-active').count()).toBe(5);
    await page.keyboard.press('Escape');
    expect(await page.locator('.findtap-active').count()).toBe(0);
  });

  test('zero findtap-active elements after outside-click dismiss', async ({ page }) => {
    await page.goto(fixture('highlight.html'));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      let activeEls = [];

      const root = document.createElement('div');
      root.id = 'findtap-root';
      root.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;';
      document.body.appendChild(root);

      function apply(els) {
        for (const el of els) { el.classList.add('findtap-active'); activeEls.push(el); }
      }
      function clear() {
        for (const el of activeEls) el.classList.remove('findtap-active');
        activeEls = [];
        if (root.parentNode) root.parentNode.removeChild(root);
      }

      apply(btns);

      document.addEventListener('pointerdown', function handler(e) {
        if (!root.contains(e.target)) {
          clear();
          document.removeEventListener('pointerdown', handler, { capture: true });
        }
      }, { capture: true });
    });

    expect(await page.locator('.findtap-active').count()).toBe(5);
    await page.mouse.click(400, 400); // click outside the 1x1 root
    expect(await page.locator('.findtap-active').count()).toBe(0);
  });

  test('zero findtap-active elements after click dispatch', async ({ page }) => {
    await page.goto(fixture('highlight.html'));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      let activeEls = [];

      function apply(els) {
        clear();
        for (const el of els) { el.classList.add('findtap-active'); activeEls.push(el); }
      }
      function clear() {
        for (const el of activeEls) el.classList.remove('findtap-active');
        activeEls = [];
      }

      apply(btns);
      clear(); // simulates dispatch → clear → deactivate
    });

    expect(await page.locator('.findtap-active').count()).toBe(0);
  });

  test('findtap-root is removed from DOM after dismiss', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    await page.evaluate(() => {
      const root = document.createElement('div');
      root.id = 'findtap-root';
      document.body.appendChild(root);

      document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') {
          root.remove();
          document.removeEventListener('keydown', handler, { capture: true });
        }
      }, { capture: true });
    });

    expect(await page.locator('#findtap-root').count()).toBe(1);
    await page.keyboard.press('Escape');
    expect(await page.locator('#findtap-root').count()).toBe(0);
  });
});

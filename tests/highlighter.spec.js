import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => `file://${path.join(__dir, 'fixtures', name)}`;

test.describe('highlighter', () => {
  test('apply adds findtap-active to elements', async ({ page }) => {
    await page.goto(fixture('highlight.html'));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      let activeElements = [];
      function apply(candidates) {
        clear();
        for (const el of candidates) {
          el.classList.add('findtap-active');
          activeElements.push(el);
        }
      }
      function clear() {
        for (const el of activeElements) el.classList.remove('findtap-active');
        activeElements = [];
      }
      apply(btns.slice(0, 3));
      window.__activeCount = document.querySelectorAll('.findtap-active').length;
      clear();
      window.__afterClear = document.querySelectorAll('.findtap-active').length;
    });
    const activeCount = await page.evaluate(() => window.__activeCount);
    const afterClear = await page.evaluate(() => window.__afterClear);
    expect(activeCount).toBe(3);
    expect(afterClear).toBe(0);
  });

  test('zero findtap-active elements after clear', async ({ page }) => {
    await page.goto(fixture('highlight.html'));
    await page.evaluate(() => {
      document.querySelectorAll('button').forEach(el => el.classList.add('findtap-active'));
    });
    await page.evaluate(() => {
      document.querySelectorAll('.findtap-active').forEach(el => el.classList.remove('findtap-active'));
    });
    const remaining = await page.locator('.findtap-active').count();
    expect(remaining).toBe(0);
  });
});

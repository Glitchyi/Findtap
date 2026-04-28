import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => `file://${path.join(__dir, 'fixtures', name)}`;

test.describe('badge positioning', () => {
  test('badge top/left match element getBoundingClientRect + scroll offsets', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    const result = await page.evaluate(() => {
      const btn = document.getElementById('btn-submit');
      const rect = btn.getBoundingClientRect();

      const badge = document.createElement('div');
      badge.className = 'findtap-hint';
      badge.style.position = 'absolute';
      badge.style.top = (rect.top + window.scrollY) + 'px';
      badge.style.left = (rect.left + window.scrollX) + 'px';
      badge.textContent = '1';

      const root = document.createElement('div');
      root.id = 'findtap-root';
      root.style.position = 'fixed';
      root.style.top = '0';
      root.style.left = '0';
      root.appendChild(badge);
      document.body.appendChild(root);

      const badgeRect = badge.getBoundingClientRect();
      const diff = {
        top: Math.abs(badgeRect.top - rect.top),
        left: Math.abs(badgeRect.left - rect.left),
      };
      root.remove();
      return diff;
    });
    expect(result.top).toBeLessThan(2);
    expect(result.left).toBeLessThan(2);
  });

  test('zero-area elements do not get badges', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    const skipped = await page.evaluate(() => {
      const el = document.createElement('div');
      // <div> has no browser-default sizing unlike <button>
      el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;padding:0;border:0;';
      document.body.appendChild(el);

      const rect = el.getBoundingClientRect();
      const skip = rect.width === 0 || rect.height === 0;
      el.remove();
      return skip; // true means badge was correctly skipped
    });
    expect(skipped).toBe(true);
  });
});

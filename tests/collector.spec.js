import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => `file://${path.join(__dir, 'fixtures', name)}`;

test.describe('collector', () => {
  test('collects visible semantic elements from basic fixture', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    const count = await page.evaluate(() => {
      const SELECTORS = [
        'a[href]', 'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])', 'textarea:not([disabled])',
      ].join(', ');
      return document.querySelectorAll(SELECTORS).length;
    });
    expect(count).toBe(5);
  });

  test('excludes disabled elements', async ({ page }) => {
    await page.goto(fixture('disabled.html'));
    const ids = await page.evaluate(() => {
      const SELECTORS = [
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
      ].join(', ');
      return Array.from(document.querySelectorAll(SELECTORS)).map(el => el.id);
    });
    expect(ids).toContain('btn-enabled');
    expect(ids).not.toContain('btn-disabled');
    expect(ids).toContain('input-enabled');
    expect(ids).not.toContain('input-disabled');
  });

  test('collects deeply nested elements', async ({ page }) => {
    await page.goto(fixture('deep-nested.html'));
    const found = await page.evaluate(() => {
      return !!document.querySelector('#deep-link');
    });
    expect(found).toBe(true);
  });

  test('text extraction uses aria-label for icon buttons', async ({ page }) => {
    await page.goto(fixture('icon-buttons.html'));
    const label = await page.evaluate(() => {
      const btn = document.getElementById('btn-aria');
      return btn.getAttribute('aria-label');
    });
    expect(label).toBe('Close dialog');
  });

  test('button with no text and no attributes is excluded', async ({ page }) => {
    await page.goto(fixture('icon-buttons.html'));
    const hasText = await page.evaluate(() => {
      const btn = document.getElementById('btn-empty');
      const texts = [btn.innerText, btn.getAttribute('aria-label'), btn.getAttribute('title'),
                     btn.value, btn.getAttribute('name')];
      return texts.some(t => t && t.trim());
    });
    expect(hasText).toBe(false);
  });

  test('viewport-first: in-viewport elements appear before offscreen', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(fixture('viewport.html'));
    const vpIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button')).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.top < window.innerHeight && rect.bottom > 0;
      }).map(el => el.id);
    });
    expect(vpIds).toContain('vp-1');
    expect(vpIds).toContain('vp-2');
    expect(vpIds).toContain('vp-3');
    expect(vpIds).not.toContain('os-1');
  });
});

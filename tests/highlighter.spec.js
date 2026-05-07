import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { apply as applyHighlight, clear as clearHighlight } from '../highlighter.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => `file://${path.join(__dir, 'fixtures', name)}`;

test.describe('highlighter', () => {
  test('apply keeps structural classes on overlapping candidates', () => {
    const first = createFakeElement({ top: 10, left: 10, width: 100, height: 40 });
    const overlapping = createFakeElement({ top: 20, left: 30, width: 100, height: 40 });
    const separate = createFakeElement({ top: 120, left: 10, width: 100, height: 40 });

    applyHighlight([{ el: first }, { el: overlapping }, { el: separate }]);

    expect(first.classList.contains('findtap-active')).toBe(true);
    expect(first.classList.contains('findtap-active-primary')).toBe(true);
    expect(overlapping.classList.contains('findtap-active')).toBe(true);
    expect(separate.classList.contains('findtap-active')).toBe(true);

    clearHighlight();
    expect(first.classList.contains('findtap-active')).toBe(false);
    expect(overlapping.classList.contains('findtap-active')).toBe(false);
    expect(separate.classList.contains('findtap-active')).toBe(false);
  });

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

function createFakeElement({ top, left, width, height }) {
  const classes = new Set();
  return {
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    getBoundingClientRect: () => ({
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height,
    }),
  };
}

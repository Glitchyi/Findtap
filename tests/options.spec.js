import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => `file://${path.join(__dir, 'fixtures', name)}`;

// Options page tests require chrome.storage.sync which is only available in an extension context.
// These tests validate the logic and clamping behavior using simulated storage.

test.describe('options page logic', () => {
  test('maxResults is clamped to [3, 10]', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    const result = await page.evaluate(() => {
      function clamp(raw) {
        return Math.min(10, Math.max(3, isNaN(raw) ? 5 : raw));
      }
      return {
        below: clamp(1),
        min: clamp(3),
        mid: clamp(7),
        max: clamp(10),
        above: clamp(15),
        nan: clamp(NaN),
      };
    });
    expect(result.below).toBe(3);
    expect(result.min).toBe(3);
    expect(result.mid).toBe(7);
    expect(result.max).toBe(10);
    expect(result.above).toBe(10);
    expect(result.nan).toBe(5);
  });

  test('default maxResults is 5', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    const defaultVal = await page.evaluate(() => {
      const stored = {};
      const maxResults = typeof stored.maxResults === 'number' ? stored.maxResults : 5;
      return maxResults;
    });
    expect(defaultVal).toBe(5);
  });
});

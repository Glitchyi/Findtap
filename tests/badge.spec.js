import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dir, '..');
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

  test('badge layer uses max z-index and palette paints after it', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    await page.addStyleTag({
      content: readFileSync(path.join(rootDir, 'styles', 'overlay.css'), 'utf8'),
    });

    await page.evaluate(() => {
      const hintLayer = document.createElement('div');
      hintLayer.id = 'findtap-hint-layer';
      document.body.appendChild(hintLayer);

      const root = document.createElement('div');
      root.id = 'findtap-root';
      const palette = document.createElement('div');
      palette.id = 'findtap-palette';
      root.appendChild(palette);
      document.body.appendChild(root);
    });

    const result = await page.evaluate(() => {
      const hintLayer = document.getElementById('findtap-hint-layer');
      const root = document.getElementById('findtap-root');
      const palette = document.getElementById('findtap-palette');
      return {
        hintZIndex: getComputedStyle(hintLayer).zIndex,
        rootZIndex: getComputedStyle(root).zIndex,
        paletteZIndex: getComputedStyle(palette).zIndex,
        rootPaintsAfterHintLayer: !!(hintLayer.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING),
      };
    });

    expect(result.hintZIndex).toBe('2147483647');
    expect(result.rootZIndex).toBe('2147483647');
    expect(result.paletteZIndex).toBe('2147483647');
    expect(result.rootPaintsAfterHintLayer).toBe(true);
  });

  test('badge placement is always inside targets and clamped to viewport', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    const overlaySource = readFileSync(path.join(rootDir, 'overlay.js'), 'utf8');
    const overlayUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(overlaySource)}`;

    const result = await page.evaluate(async (moduleUrl) => {
      const { mount, render, unmount } = await import(moduleUrl);
      mount();

      const large = document.createElement('button');
      large.getBoundingClientRect = () => ({
        top: 100,
        left: 100,
        width: 120,
        height: 48,
        right: 220,
        bottom: 148,
      });

      const small = document.createElement('button');
      small.getBoundingClientRect = () => ({
        top: 200,
        left: 200,
        width: 24,
        height: 24,
        right: 224,
        bottom: 224,
      });

      const edge = document.createElement('button');
      edge.getBoundingClientRect = () => ({
        top: -2,
        left: -2,
        width: 24,
        height: 24,
        right: 22,
        bottom: 22,
      });

      render([
        { el: large, text: 'Large target' },
        { el: small, text: 'Small target' },
        { el: edge, text: 'Edge target' },
      ]);

      const badges = Array.from(document.querySelectorAll('.findtap-hint')).map(badge => ({
        index: badge.dataset.index,
        placement: badge.dataset.placement,
        text: badge.textContent,
        top: badge.style.top,
        left: badge.style.left,
      }));

      unmount();
      return badges;
    }, overlayUrl);

    expect(result).toEqual([
      { index: '1', placement: 'inside', text: '1', top: '100px', left: '100px' },
      { index: '2', placement: 'inside', text: '2', top: '200px', left: '200px' },
      { index: '3', placement: 'inside', text: '3', top: '0px', left: '0px' },
    ]);
  });
});

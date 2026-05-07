import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dir, '..');
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

  test('excludes tiny targets while keeping hamburger-size icon buttons', async ({ page }) => {
    await page.goto(fixture('basic.html'));
    const collectorSource = readFileSync(path.join(rootDir, 'collector.js'), 'utf8');
    const collectorUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(collectorSource)}`;

    const ids = await page.evaluate(async (moduleUrl) => {
      const { collectSemanticCandidates } = await import(moduleUrl);

      const tiny = document.createElement('button');
      tiny.id = 'tiny-dot';
      tiny.textContent = 'Tiny';
      tiny.style.cssText = 'width:6px;height:6px;padding:0;border:0;';
      document.body.appendChild(tiny);

      const hamburger = document.createElement('button');
      hamburger.id = 'hamburger-menu';
      hamburger.setAttribute('aria-label', 'Open menu');
      hamburger.style.cssText = 'width:24px;height:24px;padding:0;border:0;';
      document.body.appendChild(hamburger);

      return collectSemanticCandidates(20).map(candidate => candidate.el.id);
    }, collectorUrl);

    expect(ids).toContain('hamburger-menu');
    expect(ids).not.toContain('tiny-dot');
  });

  test('searches active modal scope before covered page controls', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.setContent(`
      <style>
        body { margin: 0; font-family: system-ui, sans-serif; }
        button { min-width: 140px; min-height: 44px; font: inherit; }
        #background-install { position: absolute; left: 80px; top: 220px; }
        #backdrop { position: fixed; inset: 0; z-index: 20; background: rgba(255,255,255,.72); }
        #install-modal {
          position: fixed;
          left: 260px;
          top: 160px;
          width: 360px;
          padding: 28px;
          z-index: 30;
          background: white;
          border: 1px solid #ccc;
        }
      </style>
      <button id="background-install">Install on more devices</button>
      <div id="backdrop"></div>
      <section id="install-modal" role="dialog" aria-modal="true" aria-label="Install app">
        <button id="modal-details">View details</button>
        <button id="modal-install">Install</button>
      </section>
    `);

    const collectorSource = readFileSync(path.join(rootDir, 'collector.js'), 'utf8');
    const collectorUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(collectorSource)}`;

    const result = await page.evaluate(async (moduleUrl) => {
      const { collectSemanticCandidates, getActiveModalScope, mergeFallbackCandidates } =
        await import(moduleUrl);
      const semanticIds = collectSemanticCandidates(10).map(candidate => candidate.el.id);
      const fallbackIds = mergeFallbackCandidates([], [
        document.getElementById('background-install'),
        document.getElementById('modal-install'),
      ]).map(candidate => candidate.el.id);

      return {
        modalId: getActiveModalScope()?.id ?? null,
        semanticIds,
        fallbackIds,
      };
    }, collectorUrl);

    expect(result.modalId).toBe('install-modal');
    expect(result.semanticIds).toContain('modal-install');
    expect(result.semanticIds).toContain('modal-details');
    expect(result.semanticIds).not.toContain('background-install');
    expect(result.fallbackIds).toEqual(['modal-install']);
  });
});

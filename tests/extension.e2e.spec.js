import { test, expect } from './extension-fixture.js';

test.describe('FindTap real extension integration', () => {
  test('mounts palette and badge layers through the real extension', async ({ page, fixtureUrl, activateFindTap }) => {
    await page.goto(fixtureUrl('basic.html'));
    await activateFindTap();

    await expect(page.locator('#findtap-root')).toHaveCount(1);
    await expect(page.locator('#findtap-hint-layer')).toHaveCount(1);
    await expect(page.locator('#findtap-input')).toBeFocused();
    await expect(page.locator('.findtap-hint')).toHaveCount(5);
  });

  test('search ranks candidates and renders matching badge/highlight', async ({ page, fixtureUrl, activateFindTap }) => {
    await page.goto(fixtureUrl('basic.html'));
    await activateFindTap();

    await page.locator('#findtap-input').fill('submit');

    await expect.poll(async () => page.locator('.findtap-hint').count()).toBe(1);
    await expect(page.locator('#btn-submit')).toHaveClass(/findtap-active-primary/);
    await expect(page.locator('.findtap-hint[data-index="1"]')).toHaveText('1');
  });

  test('Enter dispatches click on the first ranked candidate and cleans up', async ({ page, fixtureUrl, activateFindTap }) => {
    await page.goto(fixtureUrl('basic.html'));
    await page.evaluate(() => {
      window.__clicked = false;
      document.getElementById('btn-submit').addEventListener('click', () => {
        window.__clicked = true;
      });
    });

    await activateFindTap();
    await page.locator('#findtap-input').fill('submit');
    await expect(page.locator('#btn-submit')).toHaveClass(/findtap-active-primary/);

    await page.keyboard.press('Enter');

    await expect.poll(async () => page.evaluate(() => window.__clicked)).toBe(true);
    await expect(page.locator('#findtap-root')).toHaveCount(0);
    await expect(page.locator('.findtap-active')).toHaveCount(0);
  });

  test('number key dispatches click on the matching candidate and cleans up', async ({ page, fixtureUrl, activateFindTap }) => {
    await page.goto(fixtureUrl('basic.html'));
    await page.evaluate(() => {
      window.__clickedId = null;
      document.querySelectorAll('a, button, input, select, textarea').forEach((el) => {
        el.addEventListener('click', (event) => {
          event.preventDefault();
          window.__clickedId = el.id;
        });
      });
    });

    await activateFindTap();
    await expect(page.locator('.findtap-hint')).toHaveCount(5);

    await page.keyboard.press('2');

    await expect.poll(async () => page.evaluate(() => window.__clickedId)).toBe('btn-submit');
    await expect(page.locator('#findtap-root')).toHaveCount(0);
    await expect(page.locator('.findtap-active')).toHaveCount(0);
  });

  test('Escape and outside click dismiss without leaking active classes', async ({ page, fixtureUrl, activateFindTap }) => {
    await page.goto(fixtureUrl('highlight.html'));
    await activateFindTap();
    await expect(page.locator('.findtap-active')).toHaveCount(5);

    await page.keyboard.press('Escape');
    await expect(page.locator('#findtap-root')).toHaveCount(0);
    await expect(page.locator('.findtap-active')).toHaveCount(0);

    await activateFindTap();
    await expect(page.locator('.findtap-active')).toHaveCount(5);
    await page.mouse.click(600, 500);
    await expect(page.locator('#findtap-root')).toHaveCount(0);
    await expect(page.locator('.findtap-active')).toHaveCount(0);
  });

  test('MutationObserver re-renders candidates without stale active classes', async ({ page, fixtureUrl, activateFindTap }) => {
    await page.goto(fixtureUrl('dynamic.html'));
    await activateFindTap();
    await page.locator('#findtap-input').fill('dynamic');

    await expect(page.locator('#btn-dynamic')).toBeVisible();
    await expect(page.locator('#btn-dynamic')).toHaveClass(/findtap-active-primary/);
    await expect(page.locator('.findtap-active')).toHaveCount(1);
  });

  test('badge coordinates use viewport getBoundingClientRect without scroll offsets', async ({ page, fixtureUrl, activateFindTap }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(fixtureUrl('viewport.html'));
    await activateFindTap();
    await expect(page.locator('.findtap-hint[data-index="1"]')).toHaveCount(1);

    await page.evaluate(() => window.scrollTo(0, 10));
    await expect.poll(async () => page.evaluate(() => {
      const target = document.getElementById('vp-1');
      const badge = document.querySelector('.findtap-hint[data-index="1"]');
      if (!target || !badge) return false;
      const rect = target.getBoundingClientRect();
      const expectedTop = Math.max(0, rect.top);
      const expectedLeft = Math.max(0, rect.left);
      const diff = {
        top: Math.abs(parseFloat(badge.style.top) - expectedTop),
        left: Math.abs(parseFloat(badge.style.left) - expectedLeft),
      };
      return diff.top < 2 && diff.left < 2;
    })).toBe(true);
  });

  test('options page persists documented storage keys', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);

    await page.locator('#maxResults').fill('7');
    await page.locator('.toggle-slider').click();
    await page.locator('#save').click();

    const stored = await page.evaluate(() => chrome.storage.sync.get(['maxResults', 'enterSelectsFirst']));
    expect(stored).toEqual({ maxResults: 7, enterSelectsFirst: false });

    await page.reload();
    await expect(page.locator('#maxResults')).toHaveValue('7');
    await expect(page.locator('#enterSelectsFirst')).not.toBeChecked();
  });
});

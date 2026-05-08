import { test as base, chromium, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { createServer } from 'http';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dir, '..');
const extensionDir = path.join(rootDir, 'dist', 'chrome');
const fixtureDir = path.join(__dir, 'fixtures');

let built = false;

function buildChrome() {
  if (built) return;
  execFileSync(process.execPath, ['build/patch.js', 'chrome'], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  built = true;
}

async function startFixtureServer() {
  const server = createServer((req, res) => {
    const rawPath = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (rawPath === '/favicon.ico') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const fileName = path.basename(rawPath === '/' ? '/basic.html' : rawPath);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(requireFixture(fileName));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    }),
  };
}

function requireFixture(fileName) {
  const fullPath = path.join(fixtureDir, fileName);
  return readFileSync(fullPath, 'utf8');
}

export const test = base.extend({
  context: async ({}, use) => {
    buildChrome();
    const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'findtap-pw-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
      ],
    });

    await use(context);

    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },

  extensionWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker);
  },

  extensionId: async ({ extensionWorker }, use) => {
    await use(extensionWorker.url().split('/')[2]);
  },

  fixtureServer: async ({}, use) => {
    const server = await startFixtureServer();
    await use(server);
    await server.close();
  },

  fixtureUrl: async ({ fixtureServer }, use) => {
    await use((name) => `${fixtureServer.origin}/${name}`);
  },

  activateFindTap: async ({ page, extensionWorker }, use) => {
    await use(async () => {
      await page.waitForLoadState('domcontentloaded');
      const url = page.url();
      await extensionWorker.evaluate(async (pageUrl) => {
        const tabs = await chrome.tabs.query({});
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs.find((candidate) => candidate.url === pageUrl) || activeTab;
        if (!tab?.id) throw new Error(`No tab found for ${pageUrl}`);
        await chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE' });
      }, url);
      await page.locator('#findtap-input').waitFor({ state: 'visible' });
    });
  },
});

export { expect };

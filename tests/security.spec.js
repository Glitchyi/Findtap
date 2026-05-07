import { test, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dir, '..');

const runtimeFiles = [
  'background.js',
  'collector.js',
  'content.js',
  'dispatcher.js',
  'fuzzy.js',
  'highlighter.js',
  'injected.js',
  'overlay.js',
  'options/options.js',
  'options/options.html',
  'styles/overlay.css',
];

const expectedDistFiles = [
  'background.js',
  'content.js',
  'injected.js',
  'manifest.json',
  'options/options.html',
  'options/options.js',
  'styles/overlay.css',
];

function readProjectFile(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function listFiles(dir) {
  const entries = [];

  function walk(currentDir) {
    for (const name of readdirSync(currentDir)) {
      const fullPath = path.join(currentDir, name);
      const rel = path.relative(dir, fullPath).replace(/\\/g, '/');
      if (statSync(fullPath).isDirectory()) walk(fullPath);
      else entries.push(rel);
    }
  }

  walk(dir);
  return entries.sort();
}

test.describe('security baseline', () => {
  test('runtime source has no network calls or remote imports', () => {
    const forbidden = [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /navigator\.sendBeacon\b/,
      /@import\s+url\s*\(/,
      /https?:\/\//,
    ];

    for (const file of runtimeFiles) {
      const source = readProjectFile(file);
      for (const pattern of forbidden) {
        expect(source, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test('runtime source has no dynamic code execution', () => {
    const forbidden = [
      /\beval\s*\(/,
      /\bnew\s+Function\s*\(/,
    ];

    for (const file of runtimeFiles) {
      const source = readProjectFile(file);
      for (const pattern of forbidden) {
        expect(source, `${file} must not match ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  test('chrome.storage.sync usage is limited to documented keys', () => {
    const allowedKeys = new Set(['maxResults', 'enterSelectsFirst']);
    const foundKeys = new Set();
    const unexpectedKeys = new Set();

    for (const file of ['content.js', 'options/options.js']) {
      const source = readProjectFile(file);
      const storageCalls = source.matchAll(/chrome\.storage\.sync\.(get|set)\s*\(([\s\S]*?)\)/g);

      for (const [, method, args] of storageCalls) {
        const keys = method === 'get'
          ? Array.from(args.matchAll(/['"]([A-Za-z0-9_]+)['"]/g)).map((match) => match[1])
          : Array.from(args.matchAll(/\b([A-Za-z0-9_]+)\b\s*(?=[:,}])/g)).map((match) => match[1]);

        for (const key of keys) {
          if (allowedKeys.has(key)) foundKeys.add(key);
          else unexpectedKeys.add(`${file}:${key}`);
        }
      }
    }

    expect([...unexpectedKeys]).toEqual([]);
    expect(foundKeys).toEqual(allowedKeys);
  });

  test('manifest keeps minimal permissions and empty host permissions', () => {
    const manifest = JSON.parse(readProjectFile('manifest.base.json'));

    expect(manifest.permissions.sort()).toEqual(['activeTab', 'scripting', 'storage']);
    expect(manifest.host_permissions).toEqual([]);
  });

  test('chrome build output contains only expected files', () => {
    execFileSync(process.execPath, ['build/patch.js', 'chrome'], {
      cwd: rootDir,
      stdio: 'inherit',
    });

    const actual = listFiles(path.join(rootDir, 'dist', 'chrome'));
    expect(actual).toEqual(expectedDistFiles);
  });
});

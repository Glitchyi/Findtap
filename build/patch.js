#!/usr/bin/env node
import { readFileSync, writeFileSync, cpSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const browser = process.argv[2];

if (!browser || !['chrome', 'firefox'].includes(browser)) {
  console.error('Usage: node build/patch.js chrome|firefox');
  process.exit(1);
}

function deepMerge(target, source) {
  for (const [key, val] of Object.entries(source)) {
    if (val && typeof val === 'object' && !Array.isArray(val) && key in target && typeof target[key] === 'object') {
      deepMerge(target[key], val);
    } else {
      target[key] = val;
    }
  }
  return target;
}

// Inline all ES modules into a single classic content.js
function bundleContent() {
  const modules = ['fuzzy.js', 'collector.js', 'highlighter.js', 'dispatcher.js', 'overlay.js'];
  let out = '';
  for (const mod of modules) {
    let src = readFileSync(join(root, mod), 'utf8');
    src = src.replace(/^export (async function|function|const|let|class) /gm, '$1 ');
    src = src.replace(/^export default /gm, '');
    out += `// ── ${mod} ──\n${src}\n`;
  }
  let main = readFileSync(join(root, 'content.js'), 'utf8');
  main = main.replace(/^import .+?from .+?;\n/gm, '');
  out += `// ── content.js ──\n${main}`;
  return out;
}

const base = JSON.parse(readFileSync(join(root, 'manifest.base.json'), 'utf8'));
const patch = JSON.parse(readFileSync(join(root, `manifest.${browser}.patch.json`), 'utf8'));
const merged = deepMerge(base, patch);

const outDir = join(root, 'dist', browser);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(merged, null, 2));
writeFileSync(join(outDir, 'content.js'), bundleContent());

const toCopy = ['background.js', 'injected.js', 'styles', 'options'];
for (const item of toCopy) {
  try {
    cpSync(join(root, item), join(outDir, item), { recursive: true });
  } catch { /* file may not exist yet during dev */ }
}

console.log(`Built dist/${browser}/manifest.json`);

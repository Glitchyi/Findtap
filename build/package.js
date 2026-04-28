#!/usr/bin/env node
/**
 * Builds and packages the extension for distribution.
 *
 * Usage:
 *   node build/package.js           → packages both browsers
 *   node build/package.js chrome    → packages Chrome only
 *   node build/package.js firefox   → packages Firefox only
 *
 * Outputs:
 *   dist/chrome-packed/findtap-chrome.zip   → Chrome Web Store
 *   dist/firefox-packed/findtap-firefox.xpi → Mozilla Add-ons (AMO)
 */

import { execSync } from 'child_process';
import { mkdirSync, readdirSync, statSync, readFileSync, createWriteStream } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');

const BROWSERS = {
  chrome:  { ext: 'zip', outName: 'findtap-chrome.zip' },
  firefox: { ext: 'xpi', outName: 'findtap-firefox.xpi' },
};

const target = process.argv[2];
const targets = target
  ? target === 'chrome' || target === 'firefox'
    ? [target]
    : (console.error(`Usage: node build/package.js [chrome|firefox]`), process.exit(1))
  : ['chrome', 'firefox'];

for (const browser of targets) {
  await pack(browser);
}

async function pack(browser) {
  const { outName } = BROWSERS[browser];
  const srcDir = join(root, 'dist', browser);
  const outDir = join(root, 'dist', `${browser}-packed`);
  const outFile = join(outDir, outName);

  console.log(`\nBuilding ${browser}…`);
  execSync(`node build/patch.js ${browser}`, { cwd: root, stdio: 'inherit' });

  mkdirSync(outDir, { recursive: true });

  try {
    execSync(`zip -r "${outFile}" .`, { cwd: srcDir, stdio: 'inherit' });
  } catch {
    console.log('zip not found, using Node fallback…');
    await zipDir(srcDir, outFile);
  }

  console.log(`Packaged → dist/${browser}-packed/${outName}`);
}

// ---------------------------------------------------------------------------
// Pure-Node zip writer (STORE, no external deps)
// Chrome Web Store and AMO both recompress server-side so STORE is fine.
// ---------------------------------------------------------------------------
async function zipDir(dir, dest) {
  const entries = [];

  (function walk(cur) {
    for (const name of readdirSync(cur)) {
      const full = join(cur, name);
      const rel = relative(dir, full).replace(/\\/g, '/');
      statSync(full).isDirectory() ? walk(full) : entries.push({ full, rel });
    }
  })(dir);

  const ws = createWriteStream(dest);
  const localOffsets = [];
  let offset = 0;

  const write = (buf) => { ws.write(buf); offset += buf.length; };
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };

  for (const { full, rel } of entries) {
    const data = readFileSync(full);
    const name = Buffer.from(rel, 'utf8');
    const crc  = crc32(data);
    localOffsets.push(offset);
    write(Buffer.from([0x50, 0x4B, 0x03, 0x04]));
    write(u16(20)); write(u16(0)); write(u16(0));   // version, flags, compression
    write(u16(0));  write(u16(0));                   // mod time, mod date
    write(u32(crc)); write(u32(data.length)); write(u32(data.length));
    write(u16(name.length)); write(u16(0));
    write(name); write(data);
  }

  const cdOffset = offset;
  for (let i = 0; i < entries.length; i++) {
    const { full, rel } = entries[i];
    const data = readFileSync(full);
    const name = Buffer.from(rel, 'utf8');
    const crc  = crc32(data);
    write(Buffer.from([0x50, 0x4B, 0x01, 0x02]));
    write(u16(20)); write(u16(20)); write(u16(0)); write(u16(0));
    write(u16(0));  write(u16(0));
    write(u32(crc)); write(u32(data.length)); write(u32(data.length));
    write(u16(name.length)); write(u16(0)); write(u16(0));
    write(u16(0)); write(u16(0)); write(u32(0)); write(u32(0));
    write(u32(localOffsets[i])); write(name);
  }

  const cdSize = offset - cdOffset;
  write(Buffer.from([0x50, 0x4B, 0x05, 0x06]));
  write(u16(0)); write(u16(0));
  write(u16(entries.length)); write(u16(entries.length));
  write(u32(cdSize)); write(u32(cdOffset)); write(u16(0));

  await new Promise((res, rej) => { ws.end(); ws.on('finish', res); ws.on('error', rej); });
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

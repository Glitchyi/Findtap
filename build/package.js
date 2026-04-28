#!/usr/bin/env node
/**
 * Builds the Chrome extension and zips it for distribution.
 * Output: dist/chrome-packed/findtap-chrome.zip
 *
 * Usage: node build/package.js
 * npm:   npm run package
 */

import { execSync } from 'child_process';
import { createWriteStream, mkdirSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const srcDir = join(root, 'dist', 'chrome');
const outDir = join(root, 'dist', 'chrome-packed');
const outZip = join(outDir, 'findtap-chrome.zip');

// 1. Build first
console.log('Building Chrome extension…');
execSync('node build/patch.js chrome', { cwd: root, stdio: 'inherit' });

// 2. Zip using native OS zip (cross-platform fallback to pure-JS below)
mkdirSync(outDir, { recursive: true });

try {
  // macOS / Linux
  execSync(`zip -r "${outZip}" .`, { cwd: srcDir, stdio: 'inherit' });
  console.log(`\nPackaged → dist/chrome-packed/findtap-chrome.zip`);
} catch {
  // Pure Node fallback (no external deps — manual zip via streams)
  console.log('zip not found, using Node fallback…');
  await zipDir(srcDir, outZip);
  console.log(`\nPackaged → dist/chrome-packed/findtap-chrome.zip`);
}

/**
 * Minimal zip writer — stores files uncompressed (STORE method).
 * Good enough for extension submission; Chrome Web Store recompresses anyway.
 */
async function zipDir(dir, dest) {
  const { createWriteStream } = await import('fs');
  const entries = [];

  function walk(cur) {
    for (const name of readdirSync(cur)) {
      const full = join(cur, name);
      const rel = relative(dir, full).replace(/\\/g, '/');
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        entries.push({ full, rel });
      }
    }
  }
  walk(dir);

  const ws = createWriteStream(dest);
  const localOffsets = [];
  let offset = 0;

  function write(buf) {
    ws.write(buf);
    offset += buf.length;
  }

  function u16le(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
  function u32le(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }

  // Local file headers + data
  for (const { full, rel } of entries) {
    const data = readFileSync(full);
    const nameBytes = Buffer.from(rel, 'utf8');
    const crc = crc32(data);

    localOffsets.push(offset);
    write(Buffer.from([0x50, 0x4B, 0x03, 0x04])); // signature
    write(u16le(20));           // version needed
    write(u16le(0));            // flags
    write(u16le(0));            // compression (STORE)
    write(u16le(0));            // mod time
    write(u16le(0));            // mod date
    write(u32le(crc));          // crc-32
    write(u32le(data.length));  // compressed size
    write(u32le(data.length));  // uncompressed size
    write(u16le(nameBytes.length));
    write(u16le(0));            // extra field length
    write(nameBytes);
    write(data);
  }

  const cdOffset = offset;

  // Central directory
  for (let i = 0; i < entries.length; i++) {
    const { full, rel } = entries[i];
    const data = readFileSync(full);
    const nameBytes = Buffer.from(rel, 'utf8');
    const crc = crc32(data);

    write(Buffer.from([0x50, 0x4B, 0x01, 0x02])); // cd signature
    write(u16le(20));           // version made by
    write(u16le(20));           // version needed
    write(u16le(0));            // flags
    write(u16le(0));            // compression
    write(u16le(0));            // mod time
    write(u16le(0));            // mod date
    write(u32le(crc));
    write(u32le(data.length));
    write(u32le(data.length));
    write(u16le(nameBytes.length));
    write(u16le(0));            // extra
    write(u16le(0));            // comment
    write(u16le(0));            // disk start
    write(u16le(0));            // internal attr
    write(u32le(0));            // external attr
    write(u32le(localOffsets[i]));
    write(nameBytes);
  }

  const cdSize = offset - cdOffset;

  // End of central directory
  write(Buffer.from([0x50, 0x4B, 0x05, 0x06]));
  write(u16le(0));              // disk number
  write(u16le(0));              // disk with cd
  write(u16le(entries.length));
  write(u16le(entries.length));
  write(u32le(cdSize));
  write(u32le(cdOffset));
  write(u16le(0));              // comment length

  await new Promise((res, rej) => { ws.end(); ws.on('finish', res); ws.on('error', rej); });
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

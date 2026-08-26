#!/usr/bin/env node
/**
 * Asserts that a packaged app contains what it needs in order to start.
 *
 * Forge's Vite plugin packages nothing outside `.vite`, so any dependency
 * left external in vite.main.config.mts silently vanishes from the bundle.
 * The result is not a build failure -- it is an app that installs, launches,
 * and then sits there with no window, because an uncaught exception in the
 * Electron main process does not exit the process.
 *
 * Nothing in the source tree reflects this, so this check runs on the build
 * output instead. Usage:
 *
 *   node tools/check-packaged-app.js arm64
 */
const { execFileSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const arch = process.argv[2];
if (!arch) {
  console.error('usage: node tools/check-packaged-app.js <arch>');
  process.exit(2);
}

const appDir = path.join('out', `Copy Pasta-darwin-${arch}`, 'Copy Pasta.app');
const asar = path.join(appDir, 'Contents', 'Resources', 'app.asar');
const failures = [];

if (!existsSync(asar)) {
  console.error(`no packaged app at ${asar} -- run electron-forge make first`);
  process.exit(2);
}

// 1. robotjs must be inside the asar. Its absence is the exact regression
//    this file exists to catch.
const listing = execFileSync(
  'npx',
  ['--yes', '@electron/asar', 'list', asar],
  { encoding: 'utf8' },
);
for (const entry of ['/node_modules/robotjs/index.js', '/node_modules/node-gyp-build/index.js']) {
  if (!listing.includes(entry)) failures.push(`missing from app.asar: ${entry}`);
}

// 2. The native binary must be unpacked. A .node inside an asar cannot be
//    dlopen'd, so packaging it without unpacking would fail at runtime.
const prebuild = path.join(
  appDir, 'Contents', 'Resources', 'app.asar.unpacked',
  'node_modules', 'robotjs', 'prebuilds', `darwin-${arch}`, 'node.napi.node',
);
if (!existsSync(prebuild)) failures.push(`missing unpacked native binary: ${prebuild}`);

if (failures.length > 0) {
  console.error(`packaged app is missing what it needs to start (${arch}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`packaged app looks startable (${arch})`);

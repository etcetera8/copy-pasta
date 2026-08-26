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
 * output instead: it extracts the actual built main.js from the asar, finds
 * every bare `require(...)` specifier in it, and asserts that each
 * non-builtin, non-electron module it names is really present in the asar.
 * A directory entry alone is not enough proof -- `asar list` emits an empty
 * stub for every pruned node_modules directory whether or not that module's
 * real files are shipped, so this checks for a real file inside the module
 * (its package.json).
 *
 * Usage:
 *
 *   node tools/check-packaged-app.js arm64
 */
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, mkdtempSync, rmSync } = require('node:fs');
const { builtinModules } = require('node:module');
const os = require('node:os');
const path = require('node:path');

const arch = process.argv[2];
if (!arch) {
  console.error('usage: node tools/check-packaged-app.js <arch>');
  process.exit(2);
}

const appDir = path.resolve(__dirname, '..', 'out', `Copy Pasta-darwin-${arch}`, 'Copy Pasta.app');
const asar = path.join(appDir, 'Contents', 'Resources', 'app.asar');
const failures = [];

if (!existsSync(asar)) {
  console.error(`no packaged app at ${asar} -- run electron-forge make first`);
  process.exit(2);
}

let listing;
let tmpDir;
try {
  // 1. Every module that main.js actually requires must be inside the asar.
  //    Deriving the list from the built bundle -- rather than hard-coding
  //    module names -- is what lets this catch a *new* module going missing,
  //    not just the ones that have already regressed once.
  listing = execFileSync(
    'npx',
    ['--yes', '@electron/asar', 'list', asar],
    { encoding: 'utf8' },
  );

  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'check-packaged-app-'));
  execFileSync(
    'npx',
    ['--yes', '@electron/asar', 'extract-file', asar, '.vite/build/main.js'],
    { cwd: tmpDir },
  );
  const src = readFileSync(path.join(tmpDir, 'main.js'), 'utf8');

  const satisfied = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`), 'electron']);
  const checked = new Set();
  for (const [, id] of src.matchAll(/\brequire\(["']([^"']+)["']\)/g)) {
    if (satisfied.has(id) || id.startsWith('.') || id.startsWith('/')) continue;
    const root = id.startsWith('@') ? id.split('/').slice(0, 2).join('/') : id.split('/')[0];
    if (checked.has(root)) continue;
    checked.add(root);
    // A bare `/node_modules/<root>` directory entry is not proof the module
    // shipped -- asar list emits an empty stub for every pruned directory
    // regardless of whether its files were included. A real file inside it
    // is proof; package.json is the reliable one to look for.
    if (!listing.includes(`/node_modules/${root}/package.json`)) {
      failures.push(`main.js requires '${id}' but /node_modules/${root} is not in app.asar`);
    }
  }
} catch (err) {
  console.error(`could not run packaged-app check: ${err.message}`);
  process.exit(2);
} finally {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
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

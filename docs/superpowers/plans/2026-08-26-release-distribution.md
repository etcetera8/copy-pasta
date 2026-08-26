# Release Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Copy Pasta as a downloadable macOS app and host the landing page that links to it, so the splash page's Download button leads to something that installs and runs.

**Architecture:** Fix the packaging so the built app actually starts (Tasks 1–3), guard that fix against silent regression (Task 4), then automate release and hosting with two GitHub Actions workflows (Tasks 6–7). Landing-page copy and README corrections follow (Tasks 5, 8). The first release is unsigned, so Task 6 ad-hoc signs the bundle — on arm64 an unsigned binary does not launch at all.

**Tech Stack:** Electron 43, Electron Forge 7 (Vite plugin, DMG/ZIP makers), Vite 8, TypeScript 6, Vitest 4, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-08-26-release-distribution-design.md`

---

## Critical context before you start

**Use yarn 1, never bare `yarn`.** Bare `yarn` on this machine resolves to corepack yarn 4.15.0, which rejects this repo's yarn-1 lockfile with `This package doesn't seem to be present in your lockfile`. Use `npx --yes yarn@1.22.22 install` (as the README says) or `npm ci`/`npm install`. The same applies inside CI.

**Run Forge through npx.** `npx electron-forge make --arch=<arch>`, not `yarn make`, for the same reason.

**A window is not proof the app works.** An uncaught exception in Electron's main process leaves the process alive with no visible crash; `app.dock.hide()` hides the modal. Verify with an IPC round-trip (Task 4 / Task 9), never by "the app opened".

**Builds are slow.** A full `make` takes several minutes. Expect that, and don't assume a hang.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `vite.main.config.mts` | Modify | Narrows Rollup externals to what genuinely cannot be bundled |
| `src/main/index.ts` | Modify | Drops the dead `electron-updater` import and its two inert listeners |
| `package.json` | Modify | Drops the `electron-updater` dependency |
| `forge.config.ts` | Modify | Ships the unbundlable native module; disables pointless native rebuilds |
| `tools/check-packaged-app.js` | Create | Asserts the packaged bundle contains what it needs to start |
| `site/index.html` | Modify | Install instructions for an unsigned app |
| `site/styles/site.scss` | Modify | Styles for those instructions |
| `site/site.test.ts` | Modify | Pins the install copy, matching the file's existing discipline |
| `.github/workflows/release.yml` | Create | Builds, signs, verifies and publishes DMGs on a `v*` tag |
| `.github/workflows/pages.yml` | Create | Builds and deploys the landing page |
| `README.md` | Modify | Corrects the "not live yet" and "nothing publishes it" claims |

---

## Task 1: Narrow the Vite externals

Rollup currently marks four modules external — meaning "don't bundle these" — while Forge's Vite plugin ships no `node_modules` at all. Three of the four can therefore never resolve. Only `electron` (supplied by the runtime) and `robotjs` (a native module Rollup cannot inline) genuinely need to stay external.

**Files:**
- Modify: `vite.main.config.mts:40`

- [ ] **Step 1: Confirm the failure you are fixing**

Run:
```bash
npx electron-forge make --arch=x64
npx --yes @electron/asar list "out/Copy Pasta-darwin-x64/Copy Pasta.app/Contents/Resources/app.asar"
```

Expected: 14 lines, all under `/.vite` plus `/package.json`. **No `node_modules` entry.** That absence is the bug.

- [ ] **Step 2: Narrow the externals**

In `vite.main.config.mts`, replace the `external` line inside `rollupOptions`:

```ts
    rollupOptions: {
      // Only these two cannot be bundled: `electron` is supplied by the
      // runtime, and `robotjs` is a native module whose .node binary Rollup
      // cannot inline. Everything else must be bundled, because the Forge
      // Vite plugin ships no node_modules -- see forge.config.ts.
      external: ['robotjs', 'electron'],
    },
```

- [ ] **Step 3: Verify the bundle absorbed electron-squirrel-startup**

Run:
```bash
npx electron-forge make --arch=x64 2>&1 | tail -3
grep -c "squirrel" ".vite/build/main.js"
```

Expected: the make succeeds, and grep reports a count of 1 or more — the module's code is now inlined rather than required by name.

Note: the build still fails to *run* at this point; `robotjs` is not shipped until Task 3.

- [ ] **Step 4: Commit**

```bash
git add vite.main.config.mts
git commit -m "Bundle every main-process dependency that can be bundled

Forge's Vite plugin packages no node_modules, so a module marked external
here can never resolve in the packaged app. Only electron and robotjs have
a real reason to stay external."
```

---

## Task 2: Remove electron-updater

`electron-updater` is required at the top of the built `main.js`, so it is one of the three modules whose absence stops the app from starting. It is also dead code: only two listeners are registered and `checkForUpdatesAndNotify()` is never called. Removing it is cheaper and smaller than shipping its eight runtime dependencies to satisfy a `require` for code that never runs.

**Files:**
- Modify: `src/main/index.ts:2` and `src/main/index.ts:98-118`
- Modify: `package.json`

- [ ] **Step 1: Delete the import**

Remove this line from the top of `src/main/index.ts`:

```ts
import { autoUpdater } from 'electron-updater';
```

- [ ] **Step 2: Delete the listeners**

Delete the entire `//#region auto-updater` … `//#endregion` block from `createWindow` — the comment block and both listeners:

```ts
  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('update_available');
  });
  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update_downloaded');
  });
```

`startClipboardWatcher();` becomes the last statement in `createWindow`.

- [ ] **Step 3: Drop the dependency**

Remove `"electron-updater": "^6.8.9",` from `dependencies` in `package.json`, then:

```bash
npx --yes yarn@1.22.22 install
```

- [ ] **Step 4: Verify nothing references it**

Run:
```bash
grep -rn "electron-updater\|autoUpdater" src/ vite.main.config.mts package.json
```

Expected: no output at all.

- [ ] **Step 5: Verify the suite still passes**

Run:
```bash
npx --yes yarn@1.22.22 lint && npx --yes yarn@1.22.22 typecheck && npx --yes yarn@1.22.22 test
```

Expected: all three pass.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.ts package.json yarn.lock
git commit -m "Remove electron-updater

It is required at the top of the built main.js, so its absence from the
package is one of three reasons the packaged app never starts. Nothing
calls checkForUpdatesAndNotify(), so the two listeners it feeds are dead
code -- shipping its eight runtime dependencies to satisfy the require
would be paying for nothing."
```

---

## Task 3: Ship robotjs and stop rebuilding natives

`robotjs` must stay external because Rollup cannot inline a `.node` binary — so it has to be copied into the package as real files. Forge's Vite plugin supplies its own `packagerConfig.ignore` **only when one is not already set**, so defining one replaces that behaviour through a supported path.

`node-gyp-build` comes along because it is robotjs's runtime loader: it picks the right prebuild for the architecture.

**Files:**
- Modify: `forge.config.ts`

- [ ] **Step 1: Add the ignore filter**

In `forge.config.ts`, add this constant above `const config: ForgeConfig = {`:

```ts
const RUNTIME_MODULES = ['/node_modules/robotjs', '/node_modules/node-gyp-build'];
```

Then replace `packagerConfig: { asar: true },` with:

```ts
  // The Vite plugin sets `ignore` to drop everything outside `.vite`, on the
  // assumption that Vite bundles every dependency. `robotjs` breaks that
  // assumption: it is a native module, so it stays external and must be
  // copied in as real files. The plugin only supplies its own `ignore` when
  // one is not already set, so defining it here replaces that behaviour
  // rather than fighting it.
  //
  // `node-gyp-build` is robotjs's runtime loader -- it picks the right
  // prebuild for the arch -- so it has to come along too.
  packagerConfig: {
    asar: true,
    ignore: (file: string): boolean => {
      if (!file) return false;
      if (file.startsWith('/.vite')) return false;
      if (file === '/node_modules') return false;
      return !RUNTIME_MODULES.some(
        (m) => file === m || file.startsWith(`${m}/`),
      );
    },
  },
```

`/node_modules` itself must be kept, or the packager never descends into it.

- [ ] **Step 2: Watch it fail on the native rebuild**

Run:
```bash
rm -rf out && npx electron-forge make --arch=arm64 2>&1 | tail -4
```

Expected: **FAILS** with `Error: node-gyp failed to rebuild '.../node_modules/robotjs'`. Now that robotjs is present, `@electron/rebuild` tries to compile it from source. Step 3 fixes this.

- [ ] **Step 3: Disable the rebuild**

In `forge.config.ts`, add immediately above `makers: [`:

```ts
  // robotjs ships N-API prebuilds for every platform it supports, and
  // `node-gyp-build` selects the right one at runtime. Rebuilding from source
  // is therefore unnecessary, needs a full toolchain, and cannot work at all
  // when packaging for an architecture other than the host's.
  rebuildConfig: { onlyModules: [] },
```

- [ ] **Step 4: Verify the native binary now ships**

Run:
```bash
rm -rf out && npx electron-forge make --arch=arm64 2>&1 | tail -3
find "out/Copy Pasta-darwin-arm64" -name "*.node" | grep darwin-arm64
```

Expected: the make succeeds, and the find prints:
```
out/Copy Pasta-darwin-arm64/Copy Pasta.app/Contents/Resources/app.asar.unpacked/node_modules/robotjs/prebuilds/darwin-arm64/node.napi.node
```

`AutoUnpackNativesPlugin` unpacked it out of the asar automatically — its glob is path-agnostic, so no extra configuration was needed.

- [ ] **Step 5: Commit**

```bash
git add forge.config.ts
git commit -m "Ship robotjs with the packaged app

The Vite plugin packages nothing outside .vite, so the one dependency that
cannot be bundled was not shipped either and main.js died on require. Keep
robotjs and its prebuild loader, and skip the native rebuild: the prebuilds
are N-API, and rebuilding cannot work when packaging for another arch."
```

---

## Task 4: Guard the packaging fix

Tasks 1–3 are properties of the *packaged bundle*, not of the source, so no unit test can cover them. A regression is invisible until a user downloads a dead app. This check runs against a built app and asserts what it must contain.

**Files:**
- Create: `tools/check-packaged-app.js`

Follows the existing pattern of `tools/check-tray-icon.js` — a plain Node script, no test framework.

- [ ] **Step 1: Write the check**

Create `tools/check-packaged-app.js`:

```js
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
```

- [ ] **Step 2: Verify it passes on the good build**

Run:
```bash
node tools/check-packaged-app.js arm64
```

Expected: `packaged app looks startable (arm64)`, exit 0.

- [ ] **Step 3: Verify it actually fails when it should**

Prove the check has teeth by breaking the build deliberately:

```bash
git stash push forge.config.ts
rm -rf out && npx electron-forge make --arch=arm64 > /dev/null 2>&1
node tools/check-packaged-app.js arm64; echo "exit=$?"
git stash pop
```

Expected: it prints `missing from app.asar: /node_modules/robotjs/index.js` and `exit=1`. A check that cannot fail is worthless — confirm this before moving on.

- [ ] **Step 4: Rebuild the good version and commit**

```bash
rm -rf out && npx electron-forge make --arch=arm64 > /dev/null 2>&1
node tools/check-packaged-app.js arm64
git add tools/check-packaged-app.js
git commit -m "Check that a packaged app contains what it needs to start

The packaging bug this catches produces no build error and no crash -- just
an app that opens nothing. It is a property of the bundle rather than the
source, so no unit test reaches it."
```

---

## Task 5: Install instructions on the landing page

The app ships unsigned, so first launch is not self-explanatory. Two things need saying: how to get past Gatekeeper, and that ⌘⇧V needs the Accessibility permission.

**Files:**
- Modify: `site/index.html:48`
- Modify: `site/styles/site.scss`
- Test: `site/site.test.ts`

**Copy constraints — the existing tests will fail if you break these:** visible text must not contain `Windows`, `Linux`, or `TODO`. Say "Apple Silicon and Intel", never "Windows".

- [ ] **Step 1: Write the failing test**

Add to `site/site.test.ts`, inside `describe('landing page', ...)`:

```ts
  /**
   * The app is unsigned, so macOS refuses the first launch and the paste
   * shortcut needs a permission the user must grant by hand. Someone who
   * downloads it without being told either of those things has a broken
   * app and no way to know why -- so the page has to say them, and this
   * pins that it keeps saying them.
   */
  it('explains how to open an unsigned build', () => {
    const install = doc.querySelector('[data-testid="install"]');
    expect(install).not.toBeNull();

    const text = install?.textContent ?? '';
    expect(text).toMatch(/Privacy & Security/);
    expect(text).toMatch(/Open Anyway/);
    expect(text).toMatch(/Accessibility/);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx --yes yarn@1.22.22 test`

Expected: FAIL — `expected null not to be null`, because `[data-testid="install"]` does not exist yet.

- [ ] **Step 3: Add the markup**

In `site/index.html`, replace the `hero__platform` line:

```html
        <p class="hero__platform">For macOS</p>
```

with:

```html
        <p class="hero__platform">For macOS — Apple Silicon and Intel</p>

        <!-- Copy Pasta is not signed with an Apple Developer ID, so macOS
             blocks the first launch. Without this note the app simply looks
             broken. Pinned by site.test.ts. -->
        <details class="install" data-testid="install">
          <summary class="install__summary">First launch needs two steps</summary>
          <ol class="install__steps">
            <li>
              macOS will say the app cannot be opened because it is from an
              unidentified developer. Open
              <strong>System Settings → Privacy &amp; Security</strong>, scroll
              to the message about Copy Pasta, and click
              <strong>Open Anyway</strong>.
            </li>
            <li>
              To let <kbd>⌘</kbd><kbd>⇧</kbd><kbd>V</kbd> paste for you, grant
              Copy Pasta <strong>Accessibility</strong> access in
              <strong>System Settings → Privacy &amp; Security →
              Accessibility</strong>.
            </li>
          </ol>
        </details>
```

- [ ] **Step 4: Style it**

Append to `site/styles/site.scss`:

```scss
// Folded away by default: it matters enormously to someone whose download
// will not open, and not at all to someone still deciding whether to try it.
.install {
  margin-top: 24px;
  font-size: 14px;
  text-align: left;
  max-width: 520px;

  &__summary {
    cursor: pointer;
    opacity: 0.7;
    text-align: center;
  }

  &__steps {
    margin: 16px 0 0;
    padding-left: 20px;
    line-height: 1.7;
    opacity: 0.85;

    li + li {
      margin-top: 12px;
    }
  }
}
```

- [ ] **Step 5: Verify the whole suite passes**

Run: `npx --yes yarn@1.22.22 test`

Expected: PASS, including the pre-existing `does not promise other platforms` and `leaves no TODO text` tests.

- [ ] **Step 6: Verify it builds and looks right**

Run: `npx --yes yarn@1.22.22 site:build`

Expected: build succeeds, output in `site/dist`.

- [ ] **Step 7: Commit**

```bash
git add site/index.html site/styles/site.scss site/site.test.ts
git commit -m "Tell people how to open an unsigned build

Gatekeeper blocks the first launch and the paste shortcut needs
Accessibility access. Without both, a working download looks like a broken
app. Folded into a <details> so it does not shout at people who have not
downloaded anything yet."
```

---

## Task 6: Release workflow

Builds both architectures on a tag push, ad-hoc signs them, verifies them, and publishes the DMGs.

**On ad-hoc signing:** shipping unsigned does *not* mean skipping `codesign`. Apple Silicon requires every binary to carry at least an ad-hoc signature to launch at all — on arm64, "unsigned" means "will not start". Forge leaves the x64 build `not signed at all` and the arm64 build carrying only the linker's own signature with `Sealed Resources=none`, so the bundle's resources are unsealed either way.

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags: ['v*']

# The workflow creates a release and uploads assets to it.
permissions:
  contents: write

jobs:
  release:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      # yarn.lock is a v1 lockfile. The `yarn` on PATH is corepack's v4,
      # which refuses it outright, so pin v1 explicitly.
      - name: Install
        run: npx --yes yarn@1.22.22 install --frozen-lockfile

      - name: Lint
        run: npx --yes yarn@1.22.22 lint

      - name: Typecheck
        run: npx --yes yarn@1.22.22 typecheck

      - name: Test
        run: npx --yes yarn@1.22.22 test

      # Both architectures land in out/make, which is not cleared between
      # runs, and the DMG names already carry the arch.
      - name: Build arm64
        run: npx electron-forge make --arch=arm64

      - name: Build x64
        run: npx electron-forge make --arch=x64

      # A .node that never shipped produces no build error -- just an app
      # that opens nothing. Fail here instead of shipping that.
      - name: Check both packages are startable
        run: |
          node tools/check-packaged-app.js arm64
          node tools/check-packaged-app.js x64

      # Not optional despite shipping unsigned: an arm64 binary with no
      # valid signature does not launch. This also seals the bundle
      # resources, which the linker's own signature does not cover.
      - name: Ad-hoc sign
        run: |
          for arch in arm64 x64; do
            codesign --force --deep --sign - "out/Copy Pasta-darwin-$arch/Copy Pasta.app"
            codesign --verify --deep --strict --verbose=2 "out/Copy Pasta-darwin-$arch/Copy Pasta.app"
          done

      # The DMGs were made before signing, so remake them around the signed
      # bundles. Forge reuses the existing package rather than rebuilding it.
      - name: Repackage signed DMGs
        run: |
          rm -f out/make/*.dmg
          npx electron-forge make --arch=arm64 --skip-package
          npx electron-forge make --arch=x64 --skip-package

      - name: Publish release
        uses: softprops/action-gh-release@v2
        with:
          files: out/make/*.dmg
          generate_release_notes: true
          fail_on_unmatched_files: true
```

- [ ] **Step 2: Verify the signing and repackage steps work locally**

The workflow cannot be run locally, but its two novel steps can. Run:

```bash
rm -rf out && npx electron-forge make --arch=arm64 > /dev/null 2>&1
codesign --force --deep --sign - "out/Copy Pasta-darwin-arm64/Copy Pasta.app"
codesign --verify --deep --strict --verbose=2 "out/Copy Pasta-darwin-arm64/Copy Pasta.app"
```

Expected: `valid on disk` and `satisfies its Designated Requirement`.

Then confirm the repackage step produces a DMG:
```bash
rm -f out/make/*.dmg && npx electron-forge make --arch=arm64 --skip-package
ls out/make/*.dmg
```

Expected: `out/make/Copy Pasta-1.0.0-arm64.dmg` exists.

Then confirm the DMG contains the *signed* app rather than a stale copy:
```bash
MP=$(hdiutil attach "out/make/Copy Pasta-1.0.0-arm64.dmg" -nobrowse -readonly | tail -1 | awk -F'\t' '{print $NF}')
codesign -dv --verbose=2 "$MP/Copy Pasta.app" 2>&1 | grep -i "Signature\|Sealed"
hdiutil detach "$MP"
```

Expected: `Signature=adhoc` and `Sealed Resources version=2 rules=13 files=16`.

The whole sequence was validated on 2026-08-26: before signing the bundle reports `Sealed
Resources=none` and `Info.plist=not bound`; after, `Sealed Resources version=2 ... files=16` and
`Info.plist entries=31`. `--skip-package` is a real flag on Forge 7 (`--skip-package  Skip
packaging the Electron application, and use the output from a previous package run instead`), and
it rebuilt a 119 MB DMG around the signed bundle.

- [ ] **Step 3: Verify the workflow file parses**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml')); print('valid yaml')"
```

Expected: `valid yaml`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "Build and publish DMGs on a version tag

Ad-hoc signs before packaging: shipping unsigned does not mean skipping
codesign, because an arm64 binary with no valid signature will not launch
at all. Pins yarn 1 explicitly -- the yarn on PATH is corepack's v4, which
rejects this repo's lockfile."
```

---

## Task 7: Pages workflow

**Files:**
- Create: `.github/workflows/pages.yml`

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: Deploy landing page

on:
  push:
    branches: [master]
    # The page pulls its palette from the app's shared tokens, so a change
    # there changes the built page too.
    paths:
      - 'site/**'
      - 'src/shared/styles/**'
      - '.github/workflows/pages.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Let a running deploy finish rather than cancelling it midway.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc

      - name: Install
        run: npx --yes yarn@1.22.22 install --frozen-lockfile

      - name: Build site
        run: npx --yes yarn@1.22.22 site:build

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: site/dist

      - id: deployment
        uses: actions/deploy-pages@v4
```

No Vite change is needed: `vite.site.config.mts` already sets `base: './'`, so the page works from the `/copy-pasta/` subpath Pages serves it at.

- [ ] **Step 2: Verify the build produces what the workflow uploads**

Run:
```bash
npx --yes yarn@1.22.22 site:build && ls site/dist
```

Expected: `index.html` and an `assets/` directory.

- [ ] **Step 3: Verify the workflow file parses**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/pages.yml')); print('valid yaml')"
```

Expected: `valid yaml`

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "Deploy the landing page to GitHub Pages

Also triggers on src/shared/styles, since the page takes its palette from
the app's tokens and would otherwise drift from them silently."
```

---

## Task 8: Correct the README

The README currently documents the broken state as if it were permanent.

**Files:**
- Modify: `README.md:48-55`

- [ ] **Step 1: Replace the stale paragraphs**

Replace lines 48–55 (from `It ships no JavaScript` through `Nothing publishes it — no CI, no Pages configuration.`) with:

~~~markdown
It ships no JavaScript of its own and shares the app's palette through
`src/shared/styles/_tokens.scss`, except for the mark itself (see
[Icons](#icons)).

`.github/workflows/pages.yml` publishes it to GitHub Pages on every push to
`master` that touches `site/` or the shared style tokens.

## Releases

Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds a DMG
for both Apple Silicon and Intel, ad-hoc signs them, and attaches them to a
GitHub release. The landing page's download button points at
`releases/latest`.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

The builds are **not** signed with an Apple Developer ID and are not
notarized, so macOS blocks the first launch until the user allows it in
System Settings → Privacy & Security. The landing page explains this.

Ad-hoc signing is still done, and is not optional: an arm64 binary with no
valid signature will not launch at all.
~~~

- [ ] **Step 2: Verify no stale claims remain**

Run:
```bash
grep -n "not live yet\|Nothing publishes it\|has no releases" README.md
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document how releases and the landing page ship"
```

---

## Task 9: Verify a packaged app actually runs

Everything so far proves the bundle *contains* the right files. This proves the app *works*, using evidence that requires a live main process — a window appearing does not qualify.

- [ ] **Step 1: Build and launch with the debugger open**

```bash
rm -rf out && npx electron-forge make --arch=x64
cd "out/Copy Pasta-darwin-x64/Copy Pasta.app/Contents/MacOS"
(./"Copy Pasta" --remote-debugging-port=9333 > /tmp/copy-pasta-run.log 2>&1 &)
cd -
```

- [ ] **Step 2: Confirm a real window exists**

```bash
curl -s --retry 25 --retry-delay 1 --retry-connrefused http://localhost:9333/json/list | python3 -c "import sys,json; d=json.load(sys.stdin); print('page targets:', sum(1 for t in d if t['type']=='page'))"
```

Expected: `page targets: 1`. This already proves every top-level `require` in `main.js` succeeded, including the `dlopen` of robotjs's `.node`.

- [ ] **Step 3: Confirm main is alive and answering IPC**

Write `/tmp/cdp-check.mjs`:

```js
// Node 22 has a built-in WebSocket, so this needs no dependencies.
const list = await (await fetch('http://localhost:9333/json/list')).json();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);

const result = await new Promise((resolve) => {
  ws.onopen = () => ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      // Both calls cross IPC into main. They only resolve if main is alive.
      expression: `(async () => JSON.stringify({
        version: await window.copyPasta.getVersion(),
        history: (await window.copyPasta.loadHistory()) ? 'resolved' : 'null',
        rootChildren: document.getElementById('root')?.children.length ?? -1,
      }))()`,
      awaitPromise: true,
      returnByValue: true,
    },
  }));
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id === 1) { resolve(m.result.result.value); ws.close(); }
  };
  setTimeout(() => resolve('TIMEOUT'), 15000);
});

console.log(result);
process.exit(0);
```

Run: `node /tmp/cdp-check.mjs`

Expected, exactly:
```
{"version":"1.0.0","history":"resolved","rootChildren":2}
```

`version` and `history` are IPC round-trips answered by main. If either is `null`, main is wedged and the packaging fix is incomplete — do not proceed.

- [ ] **Step 4: Clean up**

```bash
pkill -9 -f "Copy Pasta"; rm -f /tmp/cdp-check.mjs /tmp/copy-pasta-run.log
```

---

## Task 10: Enable Pages and cut the first release

These are one-time account actions, not code. **Confirm with the user before running Step 2** — pushing a tag publishes a public release.

- [ ] **Step 1: Enable Pages**

```bash
gh api -X POST repos/etcetera8/copy-pasta/pages -f build_type=workflow
```

Expected: JSON describing the new Pages site. If it returns `409 Conflict`, Pages is already enabled — carry on.

Then merge this branch to `master` and confirm the Pages workflow runs:
```bash
gh run list --workflow=pages.yml --limit 3
```

Expected: a completed, successful run. Visit `https://etcetera8.github.io/copy-pasta/` and confirm the page renders with its mark and the install instructions.

- [ ] **Step 2: Tag the release**

```bash
git tag v1.0.0 && git push origin v1.0.0
gh run watch
```

Expected: the Release workflow succeeds, and:
```bash
gh release view v1.0.0
```
lists both `Copy Pasta-1.0.0-arm64.dmg` and `Copy Pasta-1.0.0-x64.dmg`.

- [ ] **Step 3: Confirm the download button works end to end**

Visit the landing page, click Download, and confirm it lands on a release page listing both DMGs.

- [ ] **Step 4: Smoke-test the DMG**

Download the **x64** DMG on this Intel Mac, drag to Applications, and open it — expect the Gatekeeper prompt, then allow it via System Settings and confirm the app runs and ⌘⇧V works after granting Accessibility.

**The arm64 DMG remains unverified at runtime.** CI proves it builds, contains its native binary, and is correctly signed; it cannot prove it launches. Launch it once on an Apple Silicon Mac before announcing — and check that history loads, not merely that the window appears.

---

## Done when

- The landing page is live at a public URL with working install instructions.
- `releases/latest` lists two DMGs.
- The x64 DMG installs and runs, with ⌘⇧V pasting after Accessibility is granted.
- `tools/check-packaged-app.js` passes for both architectures in CI.

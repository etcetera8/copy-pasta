# Release Distribution — Design

**Date:** 2026-08-26
**Status:** Approved
**Scope:** Publish Copy Pasta as a downloadable macOS app, and host the landing page that links to
it. Two GitHub Actions workflows, install instructions on the page, and a README correction. No
change to app behaviour.

## 1. Background

The landing page's Download button points at
`https://github.com/etcetera8/copy-pasta/releases/latest`. That URL 404s: the repo has no releases.
The page itself is not hosted anywhere either — GitHub Pages is unconfigured, and the README says
so plainly ("Nothing publishes it — no CI, no Pages configuration"). So today there is neither a
page for someone to visit nor an artifact for them to download.

The build side is largely in place. `forge.config.ts` already registers `MakerDMG` and `MakerZIP`
for darwin. Nothing needs to compile: `robotjs` 0.9.1 loads through `node-gyp-build` and vendors
N-API prebuilds for all six platforms, `darwin-arm64` and `darwin-x64` among them, so packaging for
either Mac architecture is a file copy rather than a native build.

## 2. Decisions

Three choices were settled during design, each with a cost accepted deliberately.

**Unsigned distribution.** There is no Developer ID Application certificate — the only codesigning
identity on the machine is an Apple Development cert, which cannot notarize. Obtaining one means
enrolling in the Apple Developer Program at $99/yr. Rejected for the first release in favour of
shipping now; notarization is a documented follow-up (§7).

The cost is not only the Gatekeeper dialog. The app calls `robot.keyTap('v', 'command')`, which
requires the Accessibility permission, and macOS keys that grant to the app's code signature. An
unsigned build can therefore lose its Accessibility grant across updates and need re-approving.
This is a real functional wart, not just a cosmetic warning, and §5 addresses it in the page copy.

**Two architecture-specific DMGs**, arm64 and x64, rather than one universal binary or a single
Intel build. Universal was rejected because `@electron/universal` merging interacts badly with
`asar` plus `AutoUnpackNativesPlugin` and the `robotjs` `.node` files, for a doubled download size.
A single x64 build was rejected because it puts the majority of today's Macs on Rosetta 2. Cost:
users choose. The Download button points at `/releases/latest`, which lists both assets, so this
costs a wording change at most.

**Release by CI on tag push**, not by hand. A manual `yarn make` checklist only ever works from a
Mac and reliably rots. Cost: a workflow to maintain, which is small here because nothing compiles
and nothing is signed with a real identity.

## 2a. Packaging fix — precondition for any release

**The packaged app has never run.** Discovered on 2026-08-26 while verifying Forge's output for
§3.1, and it blocks everything else in this document: without it, a release ships a DMG that
installs a dead app.

Two individually reasonable settings combine badly:

- `@electron-forge/plugin-vite` sets `packagerConfig.ignore` to drop everything not under `/.vite`
  (`VitePlugin.js:124`), so **no `node_modules` is packaged at all**. Its assumption is that Vite
  bundles every dependency.
- `vite.main.config.mts` marks `robotjs`, `electron-squirrel-startup`, and `electron-updater` as
  Rollup **externals**, so Vite deliberately does not bundle them.

Nothing bundles those three and nothing ships them. The built `main.js` requires all three at
module top level, so it throws before `app.on('ready')` ever fires. Confirmed by listing
`app.asar`: 14 entries, no `node_modules`. The failure is invisible in development because
`npm start` resolves from the real `node_modules` on disk, and invisible at runtime for the reason
in [[electron-main-uncaught-exception-halts-app]] — the process stays alive with no window.

### The fix, verified end to end

Three changes, each necessary:

1. **Bundle what can be bundled.** Narrow the externals in `vite.main.config.mts` to `electron`
   (supplied by the runtime) and `robotjs` (native, cannot be inlined).
   `electron-squirrel-startup` is 36 lines of pure JS and bundles cleanly.
2. **Ship what cannot be bundled.** Define `packagerConfig.ignore` in `forge.config.ts` keeping
   `/.vite` plus `node_modules/robotjs` and `node_modules/node-gyp-build` (robotjs's runtime
   prebuild loader). The Vite plugin only supplies its own `ignore` when one is not already set, so
   this replaces that behaviour through a supported path rather than fighting it.
   `AutoUnpackNativesPlugin` then unpacks the `.node` binaries via its path-agnostic
   `**/{.**,**}/**/*.node` glob, with no extra configuration.
3. **Stop rebuilding native modules.** Set `rebuildConfig: { onlyModules: [] }`. Once robotjs is
   present, `@electron/rebuild` tries to compile it with node-gyp and fails. The rebuild is also
   pointless — robotjs is N-API with prebuilds for every platform — and impossible when packaging
   for an architecture other than the host's, which §2 requires.

**Verification standard.** A window appearing is not sufficient evidence. The packaged x64 app was
launched with `--remote-debugging-port=9333` and driven over the DevTools protocol:
`getVersion()` returned `"1.0.0"` and `loadHistory()` resolved. Both are IPC round-trips that only
complete if main is alive and answering, which is the evidence standard
[[electron-main-uncaught-exception-halts-app]] requires. Reaching `createWindow()` at all also
proves every top-level `require` succeeded, including the `dlopen` of robotjs's `.node`.

## 3. Release workflow

`.github/workflows/release.yml`, triggered by pushing a `v*` tag, on `macos-latest`.

1. Gate on `yarn lint`, `yarn typecheck`, `yarn test`. A red build must not become a release.
2. `yarn make --arch=arm64`, then `yarn make --arch=x64`.
3. Attach both DMGs to a GitHub Release created from the tag.

On darwin, Forge runs only `MakerZIP` and `MakerDMG` — `MakerSquirrel` is win32-only and
`MakerDeb`/`MakerRpm` default to linux — so no maker config changes are needed to keep foreign
artifacts out of the release.

`package.json` is at `1.0.0`, so the first tag is `v1.0.0`.

### 3.1 Asset naming — verified, no work needed

Confirmed against a real `make` run on 2026-08-26. `MakerDMG` already names its output
`Copy Pasta-1.0.0-x64.dmg` / `Copy Pasta-1.0.0-arm64.dmg`, so the architecture is in the filename
and there is no collision to fix. `out/make` is also **not** cleared between runs: after building
both architectures in sequence, both DMGs were present. No renaming and no staging step is
required.

### 3.2 Ad-hoc signing is mandatory

The primary technical risk. Apple Silicon requires every binary to carry at least an ad-hoc
signature in order to launch at all: on arm64, "unsigned" means "will not start", which is a
different and more severe failure than the Intel case of "shows a warning". Packaging rewrites the
bundle and invalidates the signature Electron ships with.

Measured on 2026-08-26: the x64 build is `not signed at all`, while the arm64 build carries an
`adhoc, linker-signed` signature with `Info.plist=not bound` and `Sealed Resources=none` — the
linker's own signature on the Electron binary, covering neither the bundle's resources nor its
Info.plist. Re-signing ad-hoc over the finished bundle is what seals those.

Choosing unsigned distribution therefore does **not** mean skipping signing. The build must ad-hoc
sign (`identity: '-'`) and the workflow must assert the result with `codesign --verify` before
publishing, so this failure is caught in CI rather than by a user with a dead download.

## 4. Pages workflow

`.github/workflows/pages.yml`: `yarn site:build` → `upload-pages-artifact` → `deploy-pages`. Runs
on pushes to `master` touching `site/**` or `src/shared/styles/**`, plus `workflow_dispatch`.

Pages must have its source set to "GitHub Actions" once, via `gh api`.

No Vite config change is required. `vite.site.config.mts` already sets `base: './'` — chosen so the
page works from any path rather than assuming a domain root — which is exactly what serving from
`etcetera8.github.io/copy-pasta/` needs.

The download link needs no edit. `releases/latest` is already the right URL and simply begins
resolving once a release exists.

## 5. Install instructions

An unsigned first launch is not self-explanatory, so the page gains a short note beneath the
download covering two things: the Gatekeeper step (System Settings → Privacy & Security → Open
Anyway) and the Accessibility permission that ⌘⇧V paste requires.

`site/site.test.ts` is extended to assert this copy exists, matching the file's existing discipline
of pinning contract-bearing markup so that changing it is deliberate. The new copy must avoid the
strings that file already forbids in visible text: `Windows`, `Linux`, and `TODO`.

`README.md`'s "not live yet" and "Nothing publishes it" paragraphs are corrected.

## 6. Testing

CI gates on the existing `lint` / `typecheck` / `test` scripts, plus the new site test from §5 and
the `codesign --verify` assertion from §3.2.

The §2a packaging fix cannot be covered by a unit test — it is a property of the packaged bundle,
not of the source. It is guarded instead by a check on the built app: assert that `app.asar`
contains `node_modules/robotjs`, and that an `app.asar.unpacked` `.node` binary exists for the
target architecture. This catches a silent regression of the exact failure §2a describes, which is
otherwise invisible until a user downloads it.

**Known gap, accepted:** the development machine is an Intel Mac. The x64 DMG can be smoke-tested
properly; the arm64 DMG — the one most users will download — ships verified only as far as "builds
and is correctly signed". CI cannot prove it launches. Launching the arm64 DMG once on an
Apple Silicon Mac is the recommended manual step before announcing the release — and given §2a, it
should be verified the same way: confirm a window appears *and* that history loads, not merely that
the app icon shows up.

## 7. Out of scope

- **Notarization and Developer ID.** Deferred by the §2 decision.
- **Merging `feature/28-update-notification`.** That branch's update check queries
  `releases/latest` and currently 404s *because no release exists*, so this work is the precondition
  that makes it function. It also predates the landing page and needs a rebase. Kept separate.
- **Removing `electron-updater` is now in scope**, reversing this document's first draft. It was
  originally left alone to avoid conflicting with the branch above. That was written believing it
  was merely inert dead weight; §2a shows it is require'd at the top of `main.js` and is therefore
  one of the three direct causes of the packaged app not starting. Keeping it would mean shipping
  its eight runtime dependencies (`fs-extra`, `js-yaml`, `lodash.*`, `semver`,
  `builder-util-runtime`, …) purely to satisfy a `require` for code that never runs. It is deleted
  here along with its two inert listeners; `feature/28-update-notification` deletes it too, so this
  brings the branches closer together rather than further apart.

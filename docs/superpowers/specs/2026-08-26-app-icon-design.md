# App Icon — Design

**Date:** 2026-08-26
**Status:** Approved
**Scope:** Give the packaged macOS app a real icon in place of Electron's default. One generated
`.icns`, the script that renders it, the check that guards it, and the Forge wiring. No change to
app behaviour, and no new runtime or build dependency.

## 1. Background

Drag `Copy Pasta.app` into Applications today and Finder shows Electron's default icon. The cause
is a single omission: `forge.config.ts` sets no `icon` in `packagerConfig`, so
`@electron/packager` never copies one in and the bundle keeps the icon that ships with Electron.

The app already has a mark. `site/assets/bowl.svg` is the full-colour pasta bowl used by the
landing page hero and the browser tab icon, and `src/main/bowlTemplate.svg` is the same silhouette
redrawn for the 16px menu bar. Neither is currently used for the bundle icon.

Two facts about how packager handles icons shaped the decisions below, and both are easy to get
wrong from the outside:

**The packaged `Info.plist` is not evidence.** `mac.js:316` copies the configured `.icns` over
`Contents/Resources/electron.icns` and never rewrites `CFBundleIconFile`. The plist therefore reads
`electron.icns` whether the icon was set or not. Only the file's bytes distinguish the two cases.

**A wrong path is a warning, not an error.** `platform.js:159` emits
`Could not find icon "..." with extension ".icns", skipping this app icon format` and continues.
A typo in the config produces a successful `make`, a successful release, and the default icon —
with nothing in the output that a passing build draws attention to.

Because the app calls `app.dock?.hide()` (`src/main/index.ts:152`), this icon is never a dock icon.
It is what Finder, the Applications folder, Spotlight, and the DMG window show.

## 2. Decisions

Five choices were settled during design.

**A dark plate, not a bare mark.** The icon is the app's own `#1e1e1e` as a rounded square with the
mark centred on it. The bare mark on transparency was rejected after looking at it on a light
Finder row and a colourful wallpaper: it is drawn in the dark-theme palette, so it depends on a
dark backdrop it cannot guarantee. A light plate was rejected because it would introduce a palette
the app itself never shows.

**One drawing for every slice.** All slices render from `site/assets/bowl.svg`. The alternative was
a two-drawing icon — the heavier `bowlTemplate.svg` silhouette in colour for the 16 and 32 slices,
where the hero drawing's thin strokes soften, as the README already documents for the menu bar.
Rejected: with no dock icon and no title-bar proxy icon, the 16px slice is close to unreachable in
this app, and a third drawing is a permanent maintenance cost. The softness at 16 is accepted
knowingly, having been looked at as a real render magnified ×6.

**The mark stays one file.** The render script reads `site/assets/bowl.svg` and composites the
plate itself, rather than a copy of the mark being added under `src/main/`. Copying it would
recreate exactly the drift that file was created to prevent — its own header records that the hero
and the tab icon were separate drawings once, and that one fell out of step with the other. The
cost is that the app icon's source of truth is split between an SVG and the geometry in a shell
script; that geometry is documented in the script's header.

**macOS only.** One `.icns`. `release.yml` builds nothing else — `MakerSquirrel`, `MakerDeb` and
`MakerRpm` are configured but never invoked by CI. A Windows `.ico` was rejected because `iconutil`
cannot produce one and no ImageMagick is installed, so it would mean a new devDependency for a
build that does not run. Linux needs its own `options.icon` on the Deb and Rpm makers, since
`packagerConfig.icon` does not cover it, and is rejected for the same reason.

**Render and commit, do not generate at build time.** The `.icns` is committed. Generating it in a
Forge `generateAssets` hook would keep the binary out of the repo, but would put headless Chrome on
the critical path of every `make` including CI, where its presence is an assumption. This follows
the precedent already set by the committed `bowlTemplate.png` and `bowlTemplate@2x.png`.

Also considered and rejected: authoring a `.icon` bundle in Apple's Icon Composer. Packager does
support it (`mac.js:291` resolves `.icon` ahead of `.icns`) and the development machine is on
macOS 26, but it is GUI-authored, unregenerable from source, and gated on `macos-latest` also being
macOS 26.

## 3. Geometry

The plate follows Apple's macOS 11+ grid rather than filling the canvas. On a 1024 canvas the
rounded square is 824×824 centred, leaving a 100px transparent margin on every side, with a corner
radius of 185.4 — 22.5% of the plate. These are proportions, applied at every rendered size.

This is not cosmetic pedantry: a full-bleed icon reads as roughly 20% larger than every neighbour
in the Applications folder.

The plate is filled with `#1e1e1e`, the `$black` of `src/shared/styles/_tokens.scss`. Like the
colours inside `bowl.svg` itself, it is written as hex rather than read from the tokens — Sass
cannot reach into a Chrome render driven from a shell script — so it carries the same
keep-in-step-by-hand note that `bowl.svg` already carries.

The mark's inset within the plate is a single named constant at the top of the render script,
starting at 86%. It is a starting value, not a result: `bowl.svg`'s drawing spans about 73% of its
viewBox horizontally but 92% vertically, so the rendered 128 and 512 slices must be looked at and
the constant adjusted before the `.icns` is committed. Icon proportions are not assertable.

No baked drop shadow. Apple's own icons have one, but a hand-tuned shadow that is slightly wrong
looks worse than none and cannot be undone once it is in the raster. Adding one later is a change
to the script and a re-render.

## 4. Files

| Path | What it is |
|---|---|
| `tools/render-app-icon.sh` | New. Renders the slices and builds the `.icns`. |
| `tools/check-app-icon.js` | New. Verifies the `.icns`, and that it reached the bundle. |
| `tools/lib/png.js` | New. The PNG decoder, extracted so both check scripts share it. |
| `assets/appIcon.icns` | New, committed. The generated icon. |
| `tools/check-tray-icon.js` | Imports the decoder instead of defining it. No behaviour change. |
| `forge.config.ts` | Sets `packagerConfig.icon` and `MakerDMG`'s `icon`. |
| `.github/workflows/release.yml` | Runs the icon check for both arches. |
| `README.md` | Icons section documents the third artifact. |

`assets/` is a new top-level directory rather than `src/main/`. `src/main/` holds files the running
process loads from disk, which is why `bowlTemplate.png` needs the `generateBundle` copy plugin in
`vite.main.config.mts`. The `.icns` is read by Forge at package time and never by the app, so it
needs no such plumbing. `packagerConfig.ignore` already excludes everything outside `.vite`, so it
will not be bundled.

## 5. Rendering

`tools/render-app-icon.sh` mirrors `tools/render-tray-icon.sh`, and inherits both of the quirks
that script's header documents, for the same reasons:

- The SVG is **inlined into the page**, not referenced with `<img src>`. Chrome gives every
  `file://` document an opaque origin, so a page in a temp directory may not read an SVG out of the
  repo; it renders a broken image and the screenshot is silently blank at the correct size.
- `--default-background-color=00000000` is required. Without it Chrome composites onto opaque
  white, filling the transparent margin outside the plate with a white square.

It renders seven distinct pixel sizes — 16, 32, 64, 128, 256, 512, 1024 — into a temp `.iconset`
under the ten filenames `iconutil` expects (`icon_16x16.png`, `icon_16x16@2x.png`,
`icon_32x32.png`, `icon_32x32@2x.png`, `icon_128x128.png`, `icon_128x128@2x.png`,
`icon_256x256.png`, `icon_256x256@2x.png`, `icon_512x512.png`, `icon_512x512@2x.png`), then runs
`iconutil -c icns` to produce `assets/appIcon.icns`.

Chrome's path is hardcoded to `/Applications/Google Chrome.app`, as `render-tray-icon.sh` already
does, and fails loudly if absent. CI never renders.

## 6. Checking

`tools/check-app-icon.js` runs in two modes.

**Source mode**, no arguments, run after rendering. It parses the `icns` container and, for every
slice whose payload is a PNG, decodes it and asserts three things:

- it is the dimensions its slice type declares;
- it is not blank — at least 15% of pixels are non-transparent, the floor `check-tray-icon.js`
  already uses;
- **the mark's colours are present, not only the plate's.** Counting pixels within a small
  tolerance of `#569CD6` and `#B5CEA8`, each must exceed 0.5% of the slice.

That last assertion is the one that matters. If the SVG fails to load, Chrome still produces a
perfectly good dark rounded square. That is a plausible-looking icon which would ship unnoticed; a
blank menu-bar glyph at least looks broken.

Non-PNG payloads are skipped rather than failed, because `iconutil`'s encoding choice is Apple's
and pinning a format it may change would make the check fail on a correct icon. To keep skipping
from hollowing the check out, it also asserts that the 128, 256, 512 and 1024 slices were each
decoded and checked; only 16 and 32 may be skipped. What `iconutil` actually emits gets confirmed
during implementation and recorded in the script's header.

**Packaged mode**, given an arch, run after `electron-forge make`. It asserts that
`out/Copy Pasta-darwin-<arch>/Copy Pasta.app/Contents/Resources/electron.icns` is byte-identical to
`assets/appIcon.icns`. This is the mode that catches the failure described in §1: a path that does
not resolve produces a warning and a default-iconned release. Byte comparison is the only check
that distinguishes the two outcomes, because the filename and the plist entry are identical either
way.

The PNG decoder currently inline in `tools/check-tray-icon.js` moves to `tools/lib/png.js` and both
scripts import it. It is lifted unchanged.

## 7. Wiring

`forge.config.ts`:

- `packagerConfig.icon: 'assets/appIcon.icns'`, relative to the project root Forge runs from
- `MakerDMG`'s `icon` set to the same path, so the mounted volume shows the bowl rather than a
  generic disk.

`.github/workflows/release.yml` gains a step after **Check both packages are startable**:

```yaml
- name: Check the app icon shipped
  run: |
    node tools/check-app-icon.js
    node tools/check-app-icon.js arm64
    node tools/check-app-icon.js x64
```

No npm script wraps the render. The README documents `./tools/render-tray-icon.sh` as a direct
invocation and this follows suit.

## 8. Testing

There is no Vitest test. Nothing here has unit-testable logic, and the packaged-bytes check covers
the regression that matters more convincingly than an assertion about the config object would.

Verification is:

1. `./tools/render-app-icon.sh` then `node tools/check-app-icon.js` — passes.
2. Look at the 128 and 512 slices. Adjust the inset constant if the mark sits wrong. Re-render.
3. `yarn make`, then `node tools/check-app-icon.js <arch>` — passes.
4. Open the built `.app` in Finder and confirm the icon by eye.
5. Deliberately break it: point `packagerConfig.icon` at a path that does not exist, re-package,
   and confirm the check fails. Without this the check has not been shown to detect anything.
6. `yarn lint`, `yarn typecheck`, `yarn test` — unchanged and passing.

**One gotcha for step 4.** macOS caches app icons in Icon Services. Replacing an existing
`/Applications/Copy Pasta.app` can keep showing the old Electron icon even when the bundle is
correct, so "it still looks wrong" is not evidence of failure. Check a freshly built bundle at a
new path, or `killall Finder`. Step 3 settles the question independently of what Finder draws.

## 9. Documentation

The README's Icons section gains a row for `assets/appIcon.icns` and its regenerate/verify pair
beside the tray-icon ones. It must state that the app icon composites the hero mark rather than
being a drawing of its own — that is the fact a future editor most needs, because it is the reason
the table still describes only two drawings.

The note about `--` being fatal inside the two SVG files stays accurate and unchanged: no new SVG
is added. Note the repo's own convention while editing — code comments spell an em dash `--`,
Markdown uses `—`.

## 10. Out of scope

- Windows `.ico` and Linux PNG icons (§2).
- A DMG background image, window size, or icon positions.
- Notarization and Developer ID signing, already tracked by the release-distribution design.
- Any change to `bowl.svg`, `bowlTemplate.svg`, or the menu-bar rasters.
- A baked drop shadow (§3).

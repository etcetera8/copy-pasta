# COPY PASTA

A clipboard history utility built with Electron, React and TypeScript. It keeps
what you copy, and makes it searchable and re-pastable from a global shortcut.

## Requirements

- **Node 22** — see `.nvmrc`. Electron 43 requires `>= 22.12.0`.
- **yarn 1** for installing, because `yarn.lock` is a v1 lockfile.

## Getting started

```bash
git clone https://github.com/etcetera8/copy-pasta.git
cd copy-pasta

nvm use                       # picks up .nvmrc (Node 22)
npx --yes yarn@1.22.22 install

npm start                     # run the app in development
```

`npm start` serves the renderer on port 5173 and opens the app. There is no dock
icon: reach the window with **⌘⇧V**, or the pasta bowl in the menu bar.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Run in development with hot reload |
| `npm test` | Run the test suite once (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run make` | Build distributable installers |
| `npm run site:dev` | Run the landing page locally |
| `npm run site:build` | Build the landing page to `site/dist` |

## Landing page

`site/` holds a static landing page, built separately from the app:

```bash
npm run site:dev      # preview it
npm run site:build    # output to site/dist (gitignored)
```

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

## Icons

There are only two drawings of the pasta bowl, and they are not interchangeable:

| File | Used for |
|---|---|
| `site/assets/bowl.svg` | The landing page hero, the browser tab icon, **and** the app icon |
| `src/main/bowlTemplate.svg` | The menu-bar icon, via the PNGs beside it |

`site/assets/bowl.svg` is one file referenced three times so the page, the
tab, and the packaged app cannot drift apart. Because a `<link rel="icon">`
takes a URL, it is an `<img>` on the page rather than inline SVG, and a
stylesheet cannot reach inside an image — so this one drawing carries its own
colours as hex instead of taking them from the tokens. That is the single
exception to the shared palette.

`assets/appIcon.icns` is the icon Finder shows for the packaged app, and it is
generated, not drawn: `tools/render-app-icon.sh` renders `site/assets/bowl.svg`
at seven sizes and composites a plate behind it, so there is no third drawing
to keep in step with the other two. The plate's geometry — Apple's 824/1024
grid, a corner radius at 22.5% of the plate, rounded to an even pixel count so
it centres exactly, and how much of the plate the mark itself spans — lives in
that script's header rather than here, because it is derived and tuned there
and would only go stale as a second copy.

```bash
./tools/render-app-icon.sh    # bowl.svg -> assets/appIcon.icns
node tools/check-app-icon.js  # asserts the mark is in there, not just the plate
```

That check asserts more than "non-blank" on purpose. If Chrome fails to load
the SVG — a cross-origin `file://` read, say — it still paints the plate, so
the icon comes out as a clean dark rounded square at exactly the right size,
which looks entirely deliberate rather than broken. That is why the check
asserts the mark's own blue and green are present, not merely that something
was drawn.

Given an arch, `check-app-icon.js` also compares the packaged bundle's copy of
the icon byte for byte against `assets/appIcon.icns`. `release.yml` runs it
that way for both architectures, and `ci.yml` runs it on every pull request
against the arm64 package it already builds — catching a broken icon before a
tag exists rather than after one is public. Passing an arch runs the
source-mode slice assertions first, so a single invocation covers both the
committed artifact and the build. That comparison exists because a bad
`packagerConfig.icon` path produces no diagnostic at all: `@electron/packager`
treats an unresolvable icon path as a warning rather than an error, and Forge
suppresses even that warning by passing `quiet: true`. On top of that,
packager copies the icon over `Resources/electron.icns` and never rewrites
`CFBundleIconFile`, so the packaged `Info.plist` reads `electron.icns`
whether the icon was set correctly or not. This was verified by deliberately
breaking the path: the result was a clean build, a valid DMG, and Electron's
default icon, with nothing in the log to say so. Comparing bytes is the only
honest check.

Because the app hides its dock icon, this `.icns` is what the Applications
folder, Spotlight, and the DMG window show — never a dock tile.

The menu bar needs its own drawing rather than a scaled copy: at 16px the
hero's 4–5px strokes land on about half a pixel and grey out. The template
version keeps the silhouette with heavier weights, and is pure black on
transparency, which is what lets macOS repaint it — white on a dark menu bar,
black on a light one — via `setTemplateImage(true)` in `src/main/index.ts`.

Editing the menu-bar icon means regenerating its rasters:

```bash
./tools/render-tray-icon.sh    # bowlTemplate.svg -> bowlTemplate.png + bowlTemplate@2x.png
node tools/check-tray-icon.js  # asserts they are non-blank, black, transparent
```

That check exists because both failure modes here are silent: a PNG that
rendered empty is still the right size, and one composited onto opaque white
still looks fine in a file viewer while showing as a solid block in the menu
bar. Keep `bowlTemplate@2x.png` — Electron pairs it with the 16px file by filename
alone, and losing it just upscales the small one on retina.

Note that both `.svg` files are parsed as XML, where a `--` inside a comment is
a fatal error reported as nothing more than a broken image. The repo writes
`--` for an em dash elsewhere; it cannot be used in those two files.

## How it works

Three processes with a hard boundary between them:

- `src/main` — window, tray, global shortcut, clipboard polling, robotjs, and
  the history file. All privileged work happens here.
- `src/preload` — the only bridge to the renderer, via `contextBridge`.
- `src/renderer` — a sandboxed React app. It has no Node access and reaches the
  system solely through that bridge.

History is stored as JSON in the app's user-data directory
(`~/Library/Application Support/Copy Pasta/history.json` on macOS). Unpinned
entries expire after a week; pinned entries are kept indefinitely.

There is no auto-update. `electron-updater` was removed rather than left dormant:
nothing ever called `checkForUpdatesAndNotify()`, so it was costing eight runtime
dependencies to satisfy a `require` for code that never ran. New versions are
downloaded from the [releases page](https://github.com/etcetera8/copy-pasta/releases).

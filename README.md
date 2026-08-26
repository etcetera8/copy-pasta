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

It ships no JavaScript and shares the app's palette through
`src/shared/styles/_tokens.scss`, except for the mark itself (see
[Icons](#icons)). Two links are not live yet: the download
points at the GitHub releases page, which has no releases, and the support
link is a placeholder. `site/site.test.ts` asserts the placeholder so that
hooking it up is a deliberate change.

Nothing publishes it — no CI, no Pages configuration.

## Icons

There are two drawings of the pasta bowl, and they are not interchangeable:

| File | Used for |
|---|---|
| `site/assets/bowl.svg` | The landing page hero **and** the browser tab icon |
| `src/main/bowlTemplate.svg` | The menu-bar icon, via the PNGs beside it |

`site/assets/bowl.svg` is one file referenced twice so the page and the tab
cannot drift apart. Because a `<link rel="icon">` takes a URL, it is an `<img>`
on the page rather than inline SVG, and a stylesheet cannot reach inside an
image — so this one drawing carries its own colours as hex instead of taking
them from the tokens. That is the single exception to the shared palette.

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

Auto-update is wired but **dormant** — no publish provider is configured yet.

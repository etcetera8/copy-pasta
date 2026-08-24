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

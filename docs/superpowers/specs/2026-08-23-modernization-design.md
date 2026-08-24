# Copy Pasta Modernization — Design

**Date:** 2026-08-23
**Status:** Approved
**Scope:** Full dependency modernization + fixing the bugs uncovered during audit. UI and feature set unchanged.

## 1. Background

Copy Pasta is a ~500-line Electron clipboard-history app last touched 2022-09-11 (commit `7d21be8`).
Its stack is from 2020 and no longer builds on a current machine without pinning Node 16:

- webpack 4.44 hardcodes `md4` in 7 places; Node 17+ (OpenSSL 3) removed it. The usual
  `NODE_OPTIONS=--openssl-legacy-provider` escape is unusable because Electron 10 rejects that flag.
- Node 17+ removed `openssl_fips` from `process.config.variables`. node-gyp 6.1.0 builds `config.gypi`
  from that object, so Electron 10's `common.gypi:146` tests a variable old gyp cannot resolve, and
  the robotjs native build aborts at configure.

Both problems disappear on a modern stack, so this is a forward fix, not a workaround.

### The robotjs situation changed

robotjs was dormant from 2019 (0.6.0) until March 2026, then shipped 0.7.0 → 0.9.1 (2026-08-07).
It is now **N-API** (`node-addon-api`) with **`prebuildify` prebuilts**, installed via `node-gyp-build`.
Verified present in the 0.9.1 tarball:

```
prebuilds/darwin-x64/node.napi.node      <- this machine (Intel)
prebuilds/darwin-arm64/node.napi.node
prebuilds/linux-x64, linux-arm64, win32-x64, win32-arm64
```

Consequence: no compiler, no `electron-rebuild`, no ABI pinning, no `openssl_fips` workaround.
This removes the single largest risk from the upgrade.

## 2. Target stack

| Component | Current | Target |
|---|---|---|
| Electron | 10.1.3 | 43.4.1 |
| electron-forge | 6.0.0-beta.50 | 7.11.2 |
| Bundler | webpack 4.44 + ~10 loaders | Vite 8.2 (`@electron-forge/plugin-vite` 7.11.2) |
| React | 16.13 | 19.2 |
| mobx | 5.15 / mobx-react 6.1 | 7.0 / mobx-react 10.0 |
| TypeScript | 3.9 | 7.0 |
| ESLint | 7 + @typescript-eslint 2, `.eslintrc.json` | 10, flat config |
| sass | 1.52 | 1.103 |
| robotjs | 0.6.0 (NAN, compiled) | 0.9.1 (N-API, prebuilt) |
| electron-updater | 5.0.5 | 6.8.9 |
| Dev Node | pinned 16.20.2 | 22.20.0 (Electron 43 requires >= 22.12.0) |

### Dependencies removed entirely

| Removed | Why | Replacement |
|---|---|---|
| `mobx-persist` | unmaintained 2022; incompatible with mobx 6+ | ~25-line `autorun` persist helper |
| `electron-clipboard-extended` | unmaintained 2022; renderer cannot own clipboard under contextIsolation | ~30-line main-process watcher |
| `dateformat` | unnecessary dependency | `Intl.DateTimeFormat` |
| `react-debounce-input` | unmaintained 2022 | ~10-line `useDebouncedValue` hook |
| `node-abi` | only needed for the old rebuild path | — |
| `url-loader`, `svg-url-loader`, `sass-loader`, `style-loader`, `css-loader`, `node-loader`, `ts-loader`, `copy-webpack-plugin`, `fork-ts-checker-webpack-plugin`, `@marshallofsound/webpack-asset-relocator-loader` | Vite handles SCSS/SVG/TTF/PNG natively | Vite builtins |

`electron-squirrel-startup` is retained (Windows Squirrel install hooks).

## 3. Process architecture

The renderer currently runs with `nodeIntegration: true` and no `contextIsolation`, and uses the
`remote` module — **removed in Electron 14**. This rewrite is mandatory, not optional.

All privileged access moves behind one narrow preload bridge:

```ts
// src/preload/index.ts
contextBridge.exposeInMainWorld('copyPasta', {
  loadHistory:     ()     => ipcRenderer.invoke('history:load'),
  saveHistory:     (d)    => ipcRenderer.invoke('history:save', d),
  writeClipboard:  (text) => ipcRenderer.invoke('clipboard:write', text),
  onClipboardText: (cb)   => /* subscribe; returns unsubscribe fn */,
  onToggleTheme:   (cb)   => /* subscribe; returns unsubscribe fn */,
  hideWindow:      ()     => ipcRenderer.send('window:hide'),
  hideAndPaste:    ()     => ipcRenderer.send('window:hide-and-paste'),
  getVersion:      ()     => ipcRenderer.invoke('app:version'),
});
```

Rules:
- Subscription helpers must return an unsubscribe function; the renderer must call it on unmount.
  Never expose raw `ipcRenderer` through the bridge.
- `BrowserWindow` gets `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Clipboard polling moves to main (`src/main/clipboard-watcher.ts`) and pushes `clipboard:text`.
- robotjs stays in main only, behind `window:hide-and-paste`.

### Migration of existing renderer calls

| Current | Becomes |
|---|---|
| `remote.getCurrentWindow().hide()` | `copyPasta.hideWindow()` |
| `ipcRenderer.send('hide')` | `copyPasta.hideAndPaste()` |
| `ipcRenderer.on('toggleTheme', …)` | `copyPasta.onToggleTheme(cb)` |
| `clipboard.readText()` in renderer | main pushes via `onClipboardText` |
| `clipboardListener.writeText(t)` | `copyPasta.writeClipboard(t)` |

## 4. Data model

### Current (broken)

Four overlapping arrays — `data`, `searchResults`, `pinnedData`, `unpinnedData` — all persisted.
`addData` executes `DataStore.unpinnedData = DataStore.data`, making them the **same array
reference**. `pinData` then calls `unpinnedData.splice(index, 1)`, which deletes from `data` too.
That is live data loss, and it is the root of the incoherent expiry behavior.

### Target

```ts
// src/shared/types.ts
export type Item = {
  id: number;        // Date.now() at capture; also the expiry clock
  text: string;
  pinned: boolean;
};
```

One array is the single source of truth. `pinned`, `unpinned`, and search results become **derived
getters**, never stored:

```ts
class ClipboardStore {
  items: Item[] = [];
  lightTheme = false;
  constructor() { makeAutoObservable(this) }

  get pinned()   { return this.items.filter(i =>  i.pinned) }
  get unpinned() { return this.items.filter(i => !i.pinned) }
  results(q: string) { /* derived, escaped substring match */ }
}
```

`searchResults` is no longer persisted (it never should have been).

### Behavior decision: pinned items do not expire

Unpinned items expire 7 days after `id`, checked once daily. Pinned items are exempt. Today's
behavior is incoherent because of the aliasing bug; silently discarding a deliberately pinned item
is clearly not the intent.

## 5. Storage

Owned by main, at `app.getPath('userData')/history.json`:

```json
{
  "version": 1,
  "items": [ { "id": 1755980000000, "text": "…", "pinned": false } ],
  "lightTheme": false
}
```

Rationale: `localStorage` is origin-scoped, so a dev-server port change silently orphans history
(this already happened when the forge dev port moved 3000 → 3001), and dev vs packaged never shared
a store. A file in `userData` is origin-independent, identical in dev and production, inspectable
and backup-able.

Requirements:
- Writes are atomic (write temp file, then rename) to avoid truncation on crash.
- Writes are debounced (~250 ms) — the store saves on every clipboard capture.
- Reads tolerate a missing or corrupt file by returning defaults rather than throwing.
- **One-time migration:** on first run, if `history.json` is absent, import any legacy
  `mobx-persist` payload (written by `hydrate('data', …)`, i.e. `localStorage` key `data`), flatten `data` + `pinnedData` into `items` with the correct
  `pinned` flag, de-duplicate by `id`, then write `history.json`. Migration must never throw.

## 6. Bugs fixed

Referenced against current `master`.

| # | Location | Bug |
|---|---|---|
| 1 | `dataStore.ts:39,52,77` | `unpinnedData = data` aliases one array; `pinData`'s `splice` deletes from `data`. Data loss. |
| 2 | `dataStore.ts:55-56,67-68` | `find()` may return `undefined`, which is then pushed into the arrays. |
| 3 | `dataStore.ts:70-78` | `clearExpiredData` never cleans `pinnedData` and re-aliases. |
| 4 | `dataStore.ts:95-103` | `searchResults` persisted pointlessly. |
| 5 | `Landing.tsx:17,34` | `intervalId` captured as `null` in a `[]`-deps cleanup; interval never cleared. |
| 6 | `Landing.tsx:39` | `new RegExp(searchTerm)` unescaped — typing `(` or `[` throws. |
| 7 | `Landing.tsx:85-86` | `data[data.length - 1]` unguarded; TypeError when empty or all-pinned. |
| 8 | `Landing.tsx:47` | `remote` module — removed in Electron 14. |
| 9 | `Landing.tsx:47` | `event.keyCode` deprecated → `event.key === 'Escape'`. |
| 10 | `index.ts:73-79` | `document` / `ipcRenderer` used in the **main** process. Throws `ReferenceError` silently, so `ready-to-show` and the autoUpdater handlers never register. |
| 11 | `App.tsx:7` | `ReactDOM.render` removed in React 19 → `createRoot`. |
| 12 | `Row.tsx:2-3` | `pinIcon` / `unpinIcon` imported but never rendered. |
| 13 | `Row.tsx:17` | numeric `id` on a DOM node. |
| 14 | `Row.tsx:18` | `isEven` inverted (`!isEven ? 'even' : ''`). |
| 15 | `landingModel.ts` | entire file dead — never imported. |
| 16 | `.eslintrc.json:10` | trailing comma — invalid JSON. |

Bug 10 is fixed by **relocating** the version/IPC code to the renderer and adding the missing
`ipcMain.handle('app:version')`. Auto-update stays **dormant** (no publish provider configured);
a GitHub issue tracks finishing it.

## 7. File layout

```
src/
  main/
    index.ts              app lifecycle, BrowserWindow, Tray, global shortcut
    clipboard-watcher.ts  polls clipboard, emits clipboard:text
    history-store.ts      userData JSON read/write, atomic + debounced, migration
    ipc.ts                ipcMain handlers
  preload/
    index.ts              contextBridge surface
  renderer/
    index.html
    App.tsx
    pages/Landing.tsx
    components/Row.tsx
    store/clipboardStore.ts
    store/persist.ts
    hooks/useDebouncedValue.ts
    styles/*.scss
    assets/, fonts/
  shared/
    types.ts              shared across main / preload / renderer
forge.config.ts
vite.main.config.ts / vite.preload.config.ts / vite.renderer.config.ts
eslint.config.js
.nvmrc
```

Deleted: `webpack.{main,renderer,rules,plugins}.js`, `src/renderer/models/landingModel.ts`,
`.eslintrc.json`, `package-lock.json` (stale 2020; `yarn.lock` is authoritative).

## 8. Phases

Strictly sequential — each depends on the previous. One branch and one PR per phase. Every phase
must leave the app in a launchable, working state.

Two coupling constraints drive this ordering:

- **Electron 43 removes `remote`.** The moment Electron is upgraded, `Landing.tsx:47` breaks. Phase 1
  therefore includes a *minimal* `remote` removal (plain IPC, still `nodeIntegration: true`); phase 2
  replaces that with the real bridge.
- **React 19 → mobx-react 10 → mobx 7 → `mobx-persist` is dead.** Replacing persistence is the natural
  moment to normalize the data model and move storage to `userData`. Splitting these would mean
  writing an intermediate on-disk format and migrating twice, so they are one phase.

| # | Branch | Content | Done when |
|---|---|---|---|
| 1 | `modernize/01-toolchain` | forge 7 + Vite + Electron 43 + TS 7 + robotjs 0.9.1 + sass; delete `webpack.*.js`, `.eslintrc.json`, `package-lock.json`; add `forge.config.ts`, `vite.*.config.ts`, `eslint.config.js`, `.nvmrc`. Minimal `remote` → IPC fix. React 16 / mobx 5 / mobx-persist untouched. | `npm start` launches on Node 22, window renders, robotjs loads, Escape-to-hide still works |
| 2 | `modernize/02-process-model` | preload + `contextBridge`, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; clipboard watcher moves to main; renderer stops importing `electron` | App runs fully sandboxed; copy, paste, hide, theme toggle all work |
| 3 | `modernize/03-state-layer` | React 19 `createRoot`; mobx 7 `makeAutoObservable` + mobx-react 10; drop `mobx-persist`; normalize to `Item[]` with derived getters; `history.json` in `userData` with atomic + debounced writes; one-time localStorage migration; pinned-items-never-expire | History survives restart; pin/unpin no longer corrupts; legacy history imported once |
| 4 | `modernize/04-bugfixes-cleanup` | Bugs 5-7, 9, 12-14; delete `landingModel.ts`; drop `react-debounce-input` for `useDebouncedValue`; drop `dateformat` for `Intl.DateTimeFormat` | Search accepts `(`; clicking with empty history is safe; interval actually cleared |
| 5 | `modernize/05-autoupdate-placement` | Move version/IPC code to the renderer, add `ipcMain.handle('app:version')`, render `#version`; leave update checks dormant; open tracking issue | Version string renders; nothing throws; GitHub issue filed |

Branches stack: phase N branches from phase N-1, and its PR targets phase N-1. GitHub re-targets each
PR automatically as the one beneath it merges.

## 9. Verification

No automated test suite (explicit scope decision). Each phase is verified by driving the real app:

1. `npm start` on Node 22 — must reach `Launching Application` with a clean log.
2. Renderer rendered offscreen via `webContents.capturePage()` against the dev server, and the
   PNG inspected. A blank frame is a failure.
3. robotjs loaded under Electron and a read-only call (`getScreenSize()`) exercised.
   **Never call `keyTap` during verification** — it would paste into whatever app has focus.
4. Phase 3 additionally: restart the app and confirm history persisted to `history.json`.

### Recorded risk

Phases 3 and 4 rewrite exactly the logic where the subtle bugs live (pin/unpin, expiry, dedupe)
with no automated tests. Launch verification proves the app starts; it does not prove those
state transitions are correct. The store is pure functions over an array, so ~30 lines of Vitest
would cover it. Accepted by the user; recorded here deliberately.

## 10. Out of scope

UI redesign; test suite; auto-update publish pipeline; Windows/Linux verification (macOS Intel
only); universal/arm64 packaging (prebuilts exist, so it stays open).

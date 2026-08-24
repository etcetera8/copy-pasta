# Copy Pasta Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring a 2022-era Electron clipboard app to a current stack (Electron 43, Vite 8, React 19, mobx 7, TypeScript 7) and fix the 16 bugs found during audit, without changing the UI or feature set.

**Architecture:** Three processes with a hard boundary. `src/main` owns all privileged work — window, tray, global shortcut, clipboard polling, robotjs, and the history file. `src/preload` exposes one narrow `contextBridge` API. `src/renderer` is a plain sandboxed React app that reaches the system only through that bridge. State is a single mobx store over one normalized `Item[]`, persisted by main to `userData/history.json`.

**Tech Stack:** Electron 43.4.1, electron-forge 7.11.2 + `@electron-forge/plugin-vite`, Vite 8.2.2, React 19.2.8, mobx 7.0.3 + mobx-react 10.0.2, TypeScript 7.0.2, robotjs 0.9.1 (N-API prebuilt), sass 1.103.1, ESLint 10 flat config.

**Companion spec:** `docs/superpowers/specs/2026-08-23-modernization-design.md` — read it first.

---

## Conventions (apply to every task)

**Node version.** Everything runs on Node 22.20.0. Electron 43 requires `>= 22.12.0`. Do **not** use Node 16 — that pin existed only for the old stack and is removed in Phase 1.

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22
```

**Package manager.** yarn 1 against the existing `yarn.lock`. Do not switch to npm; do not run `corepack`.
Under Node 22 the `yarn` on PATH is yarn 4 — invoke classic explicitly:

```bash
npx --yes yarn@1.22.22 <cmd>
```

**Branching.** One branch per phase, stacked. Phase N branches from phase N-1 and its PR targets phase N-1.

```bash
git checkout modernize/0<N-1>-<name>          # or master for phase 1
git checkout -b modernize/0<N>-<name>
```

**Commits.** Atomic — one logical change each. Every commit message ends with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XaSMKDXibDStS3Lk5HLYfH
```

**PRs.** End every PR body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XaSMKDXibDStS3Lk5HLYfH
```

**Verification harness.** There is no test suite (deliberate scope decision). Each phase is verified by
driving the real app. Two reusable procedures:

*V1 — launch check.* Start the app in the background and confirm it reaches launch with a clean log.

```bash
npm start > /tmp/cp-start.log 2>&1 &
# poll until one of these appears, then read the log
grep -qE "Launching Application|error|Error|ERR" /tmp/cp-start.log
```
Expected: `Launching Application`, an Electron main process alive, and no `Error`/`ERR!` lines.

*V2 — render check.* The window opens hidden (`show: false`), so render it offscreen from the dev
server instead. Create this in a temp dir (NOT in the repo), substituting the dev server port:

```js
// /tmp/shot/main.js   (package.json: {"name":"shot","version":"1.0.0","main":"main.js"})
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
app.on('ready', () => {
  const w = new BrowserWindow({ width: 900, height: 700, show: false,
    webPreferences: { nodeIntegration: true } });
  w.webContents.on('console-message', (e, l, m) => console.log('R:', m));
  w.loadURL(process.env.DEV_URL);
  w.webContents.once('did-finish-load', () => setTimeout(async () => {
    fs.writeFileSync('/tmp/shot/app.png', (await w.webContents.capturePage()).toPNG());
    console.log('CHILDREN=' + await w.webContents.executeJavaScript(
      "document.getElementById('root').children.length"));
    app.quit();
  }, 3500));
});
```
Run with `DEV_URL=http://localhost:<port>/... node_modules/.bin/electron /tmp/shot`, then **look at
the PNG**. `CHILDREN=0` or a blank frame is a failure, not a pass.

*V3 — robotjs check.* Confirm the native module loads under Electron:

```js
const robot = require('<repo>/node_modules/robotjs');
console.log('OK', robot.getScreenSize());
```
**Never call `robot.keyTap()` during verification** — it types into whatever app currently has focus.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/main/index.ts` | app lifecycle, BrowserWindow, Tray, global shortcut |
| `src/main/clipboard-watcher.ts` | poll system clipboard, emit `clipboard:text` |
| `src/main/history-store.ts` | read/write `userData/history.json`, atomic + debounced, legacy migration |
| `src/main/ipc.ts` | all `ipcMain` handlers |
| `src/preload/index.ts` | the only `contextBridge` surface |
| `src/renderer/App.tsx` | React root (`createRoot`) |
| `src/renderer/pages/Landing.tsx` | main view |
| `src/renderer/components/Row.tsx` | one history row |
| `src/renderer/store/clipboardStore.ts` | mobx store over `Item[]` |
| `src/renderer/hooks/useDebouncedValue.ts` | replaces `react-debounce-input` |
| `src/shared/types.ts` | `Item`, IPC payload types, `window.copyPasta` typing |
| `forge.config.ts` | forge 7 config (replaces the `config.forge` block in package.json) |
| `vite.{main,preload,renderer}.config.ts` | three Vite builds |

Deleted across the plan: `webpack.{main,renderer,rules,plugins}.js`, `.eslintrc.json`,
`package-lock.json`, `src/renderer/models/landingModel.ts`, `src/index.ts` (moves to `src/main/`).

---

# Phase 1 — Toolchain

**Branch:** `modernize/01-toolchain` from `master`. **PR target:** `master`.

**Why `remote` is handled here:** Electron 43 removed the `remote` module. The moment Electron is
upgraded, `Landing.tsx:47` throws. Phase 1 therefore does a *minimal* IPC replacement while keeping
`nodeIntegration: true`; Phase 2 replaces it with the real bridge.

### Task 1.1: Replace dependencies

**Files:** Modify `package.json`

- [ ] **Step 1: Remove the `config.forge` block from `package.json`** — it moves to `forge.config.ts` in Task 1.2. Delete the entire `"config": { "forge": {...} }` key.

- [ ] **Step 2: Set dependencies exactly**

```json
"dependencies": {
  "electron-squirrel-startup": "^1.0.1",
  "electron-updater": "^6.8.9",
  "mobx": "^7.0.3",
  "mobx-react": "^10.0.2",
  "react": "^19.2.8",
  "react-dom": "^19.2.8",
  "robotjs": "^0.9.1"
},
"devDependencies": {
  "@electron-forge/cli": "^7.11.2",
  "@electron-forge/maker-deb": "^7.11.2",
  "@electron-forge/maker-dmg": "^7.11.2",
  "@electron-forge/maker-rpm": "^7.11.2",
  "@electron-forge/maker-squirrel": "^7.11.2",
  "@electron-forge/maker-zip": "^7.11.2",
  "@electron-forge/plugin-auto-unpack-natives": "^7.11.2",
  "@electron-forge/plugin-vite": "^7.11.2",
  "@types/react": "^19.2.0",
  "@types/react-dom": "^19.2.0",
  "electron": "^43.4.1",
  "eslint": "^10.9.0",
  "sass": "^1.103.1",
  "typescript": "^7.0.2",
  "typescript-eslint": "^8.0.0",
  "vite": "^8.2.2"
}
```

Note: React 19 and mobx 7 land here because the toolchain resolves them together; the *code* migration
to `createRoot` / `makeAutoObservable` is Phase 3. If React 16 code fails to build against React 19
types, add `"skipLibCheck": true` (already present in tsconfig) and defer — do not start Phase 3 work.

Removed and not replaced: `dateformat`, `@types/dateformat`, `electron-clipboard-extended`,
`@types/electron-clipboard-extended`, `mobx-persist`, `node-abi`, `react-debounce-input`,
`svg-url-loader`, `electron-rebuild`, and all webpack loaders/plugins.

**Keep** `@electron-forge/plugin-auto-unpack-natives` — robotjs's `.node` must sit outside the asar.

- [ ] **Step 3: Delete the stale lockfile and reinstall**

```bash
rm -f package-lock.json
rm -rf node_modules
npx --yes yarn@1.22.22 install
```
Expected: completes without a native build step — robotjs 0.9.1 installs via `node-gyp-build` and
uses `prebuilds/darwin-x64/node.napi.node`.

- [ ] **Step 4: Verify robotjs resolved to a prebuilt binary**

```bash
ls node_modules/robotjs/prebuilds/darwin-x64/node.napi.node
```
Expected: the file exists. If instead there is a `build/Release/` directory, it compiled from source —
investigate before continuing.

- [ ] **Step 5: Commit**

```bash
git add package.json yarn.lock
git rm --cached package-lock.json
git commit -m "build: upgrade to Electron 43, Vite, React 19, mobx 7, TypeScript 7"
```

### Task 1.2: forge + Vite configuration

**Files:** Create `forge.config.ts`, `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`. Delete `webpack.main.config.js`, `webpack.renderer.config.js`, `webpack.rules.js`, `webpack.plugins.js`.

- [ ] **Step 1: Create `forge.config.ts`**

```ts
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';

const config: ForgeConfig = {
  packagerConfig: { asar: true },
  makers: [
    new MakerSquirrel({ name: 'pasta' }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({ format: 'ULFO' }, ['darwin']),
    new MakerDeb({}),
    new MakerRpm({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts',    config: 'vite.main.config.ts',    target: 'main' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
};

export default config;
```

- [ ] **Step 2: Create `vite.main.config.ts`** — robotjs is a native module and must stay external.

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: { external: ['robotjs', 'electron', 'electron-squirrel-startup', 'electron-updater'] },
  },
});
```

- [ ] **Step 3: Create `vite.preload.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: { rollupOptions: { external: ['electron'] } },
});
```

- [ ] **Step 4: Create `vite.renderer.config.ts`** — SCSS, SVG, TTF and PNG are handled natively.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
});
```

Add `@vitejs/plugin-react` to devDependencies (latest) and reinstall.

- [ ] **Step 5: Delete the webpack configs**

```bash
git rm webpack.main.config.js webpack.renderer.config.js webpack.rules.js webpack.plugins.js
```

- [ ] **Step 6: Commit**

```bash
git add forge.config.ts vite.main.config.ts vite.preload.config.ts vite.renderer.config.ts package.json yarn.lock
git commit -m "build: replace webpack config with forge 7 + Vite"
```

### Task 1.3: Relocate sources to the three-process layout

**Files:** Move `src/index.ts` → `src/main/index.ts`. Move `src/index.html` → `src/renderer/index.html`. Create `src/preload/index.ts` (stub). Create `src/shared/types.ts`.

- [ ] **Step 1: Move files**

```bash
mkdir -p src/main src/preload src/shared
git mv src/index.ts src/main/index.ts
git mv src/index.html src/renderer/index.html
```

- [ ] **Step 2: Fix `src/renderer/index.html`** — Vite needs a real module script pointing at the entry.

```html
<!DOCTYPE html>
<html>
  <head><meta charset="UTF-8" /><title>Copy Pasta</title></head>
  <body>
    <div id="root"></div>
    <p id="version"></p>
    <script type="module" src="./App.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create a stub `src/preload/index.ts`** (filled in Phase 2)

```ts
// Bridge surface is introduced in Phase 2.
export {};
```

- [ ] **Step 4: Create `src/shared/types.ts`**

```ts
export type Item = {
  id: number;
  text: string;
  pinned: boolean;
};
```

- [ ] **Step 5: Point the window at the preload script and fix asset paths in `src/main/index.ts`**

Replace the `MAIN_WINDOW_WEBPACK_ENTRY` declaration and `loadURL` call with forge's Vite variables:

```ts
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// inside createWindow, after `new BrowserWindow({...})`:
if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
  mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
} else {
  mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
}
```

Add to the `webPreferences` object: `preload: path.join(__dirname, '../preload/index.js')`.
Leave `nodeIntegration: true` for now — Phase 2 changes it.

`bowl.png` was copied by CopyWebpackPlugin. Move it to `src/main/bowl.png` and import it so Vite
emits it, or resolve it relative to the built main bundle. Verify the Tray icon still appears.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move to main/preload/renderer/shared layout"
```

### Task 1.4: Minimal `remote` removal (unblocks Electron 43)

**Files:** Modify `src/renderer/pages/Landing.tsx:1,47`, `src/main/index.ts`

- [ ] **Step 1: Add an `ipcMain` handler in `src/main/index.ts`** (near the existing `ipcMain.on('hide', …)`)

```ts
ipcMain.on('window:hide', () => {
  BrowserWindow.getAllWindows()[0]?.hide();
});
```

- [ ] **Step 2: Replace the `remote` call in `Landing.tsx:47`**

```ts
const escapeListener = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') ipcRenderer.send('window:hide');
};
```

- [ ] **Step 3: Drop `remote` from the import on `Landing.tsx:1`**

```ts
import { clipboard, ipcRenderer } from 'electron';
```

Also remove `remote` from `src/renderer/models/landingModel.ts:1` if that file still exists (it is
deleted in Phase 4; leaving it importing `remote` will break the build now).

- [ ] **Step 4: Verify no `remote` references remain**

```bash
grep -rn "from 'electron'" src/ | grep remote
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git commit -am "fix: replace removed Electron remote module with IPC"
```

### Task 1.5: ESLint flat config, tsconfig, `.nvmrc`

**Files:** Create `eslint.config.js`, `.nvmrc`. Delete `.eslintrc.json`. Modify `tsconfig.json`, `package.json`.

- [ ] **Step 1: Delete the old config** (it also contains a trailing comma making it invalid JSON — bug 16)

```bash
git rm .eslintrc.json
```

- [ ] **Step 2: Create `eslint.config.js`**

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['.vite/**', 'out/**', 'dist/**', 'node_modules/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
```

- [ ] **Step 3: Create `.nvmrc`**

```
22
```

- [ ] **Step 4: Update `tsconfig.json`** — `module`/`moduleResolution` must suit Vite, and drop the `paths` hack.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": false,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*"]
}
```

`"jsx": "react-jsx"` means components no longer need `import React` — leave existing imports alone
for now; Phase 4 cleans them.

- [ ] **Step 5: Update the `lint` script in `package.json`**

```json
"lint": "eslint ."
```

- [ ] **Step 6: Run the linter**

```bash
npx --yes yarn@1.22.22 lint
```
Expected: it runs to completion. Warnings are acceptable at this stage; a crash is not.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: migrate to ESLint flat config, add .nvmrc, retarget tsconfig for Vite"
```

### Task 1.6: Verify and open the PR

- [ ] **Step 1: Run V1 (launch check).** Expected: `Launching Application`, no `Error` lines. Note the Vite dev server port from the log (Vite defaults to 5173, not 3000 — the old port collision is gone).

- [ ] **Step 2: Run V2 (render check)** against `http://localhost:<port>`. **Look at the PNG.** Expected: the Copy Pasta UI with title, search box, Clear All, Content/Date headers, Show More. `CHILDREN=1`.

- [ ] **Step 3: Run V3 (robotjs check).** Expected: `OK { width: …, height: … }`.

- [ ] **Step 4: Confirm the tray icon and Escape-to-hide still work** — the Tray uses `bowl.png`, whose path handling changed in Task 1.3.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin modernize/01-toolchain
gh pr create --base master --head modernize/01-toolchain --title "build: modernize toolchain to Electron 43 + Vite" --body "..."
```

---

# Phase 2 — Process model

**Branch:** `modernize/02-process-model` from `modernize/01-toolchain`. **PR target:** `modernize/01-toolchain`.

### Task 2.1: Define the bridge contract

**Files:** Modify `src/shared/types.ts`

- [ ] **Step 1: Add the API type**

```ts
export type CopyPastaApi = {
  loadHistory:     () => Promise<{ items: Item[]; lightTheme: boolean }>;
  saveHistory:     (data: { items: Item[]; lightTheme: boolean }) => Promise<void>;
  writeClipboard:  (text: string) => Promise<void>;
  onClipboardText: (cb: (text: string) => void) => () => void;
  onToggleTheme:   (cb: () => void) => () => void;
  hideWindow:      () => void;
  hideAndPaste:    () => void;
  getVersion:      () => Promise<string>;
};

declare global {
  interface Window { copyPasta: CopyPastaApi }
}
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat: define preload bridge contract"
```

### Task 2.2: Implement the preload bridge

**Files:** Modify `src/preload/index.ts`

- [ ] **Step 1: Implement it.** Subscription helpers must return an unsubscribe function, and raw `ipcRenderer` must never be exposed.

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { CopyPastaApi, Item } from '../shared/types';

const api: CopyPastaApi = {
  loadHistory:    () => ipcRenderer.invoke('history:load'),
  saveHistory:    (data) => ipcRenderer.invoke('history:save', data),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  onClipboardText: (cb) => {
    const h = (_e: unknown, text: string) => cb(text);
    ipcRenderer.on('clipboard:text', h);
    return () => ipcRenderer.removeListener('clipboard:text', h);
  },
  onToggleTheme: (cb) => {
    const h = () => cb();
    ipcRenderer.on('theme:toggle', h);
    return () => ipcRenderer.removeListener('theme:toggle', h);
  },
  hideWindow:   () => ipcRenderer.send('window:hide'),
  hideAndPaste: () => ipcRenderer.send('window:hide-and-paste'),
  getVersion:   () => ipcRenderer.invoke('app:version'),
};

contextBridge.exposeInMainWorld('copyPasta', api);
```

- [ ] **Step 2: Commit**

```bash
git commit -am "feat: implement contextBridge preload surface"
```

### Task 2.3: Move clipboard watching into main

**Files:** Create `src/main/clipboard-watcher.ts`. Modify `src/main/index.ts`.

- [ ] **Step 1: Create the watcher.** This replaces the unmaintained `electron-clipboard-extended`.

```ts
import { clipboard, BrowserWindow } from 'electron';

const POLL_MS = 500;

export function startClipboardWatcher(): () => void {
  let last = clipboard.readText();
  const timer = setInterval(() => {
    const text = clipboard.readText();
    if (text && text !== last) {
      last = text;
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('clipboard:text', text);
      }
    }
  }, POLL_MS);
  return () => clearInterval(timer);
}
```

Note: `last` must also be updated when the app itself writes the clipboard, or selecting an item
re-captures it as a new entry. `ipc.ts` handles that in Task 2.4 by exporting a `syncLast` setter —
implement it as a module-level `let last` with an exported `noteWrite(text: string)`.

- [ ] **Step 2: Call it from `src/main/index.ts`** after the window is created, and stop it on `will-quit`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: move clipboard watching to the main process"
```

### Task 2.4: Main-side IPC handlers

**Files:** Create `src/main/ipc.ts`. Modify `src/main/index.ts`.

- [ ] **Step 1: Implement handlers**

```ts
import { app, BrowserWindow, clipboard, ipcMain } from 'electron';
import robot from 'robotjs';
import { noteWrite } from './clipboard-watcher';

export function registerIpc(): void {
  ipcMain.handle('clipboard:write', (_e, text: string) => {
    clipboard.writeText(text);
    noteWrite(text);
  });

  ipcMain.handle('app:version', () => app.getVersion());

  ipcMain.on('window:hide', () => {
    BrowserWindow.getAllWindows()[0]?.hide();
  });

  ipcMain.on('window:hide-and-paste', () => {
    app.hide();
    robot.keyTap('v', 'command');
  });
}
```

History handlers are added in Phase 3.

- [ ] **Step 2: Remove the old `ipcMain.on('hide', …)` block from `src/main/index.ts`** and call `registerIpc()` instead.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: centralize ipcMain handlers"
```

### Task 2.5: Lock down the renderer

**Files:** Modify `src/main/index.ts`, `src/renderer/pages/Landing.tsx`

- [ ] **Step 1: Change `webPreferences`**

```ts
webPreferences: {
  preload: path.join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
},
```

- [ ] **Step 2: Remove every `electron` import from the renderer.** In `Landing.tsx` replace, per the spec's migration table:

| Was | Now |
|---|---|
| `remote.getCurrentWindow().hide()` / `ipcRenderer.send('window:hide')` | `window.copyPasta.hideWindow()` |
| `ipcRenderer.send('hide')` | `window.copyPasta.hideAndPaste()` |
| `ipcRenderer.on('toggleTheme', cb)` | `window.copyPasta.onToggleTheme(cb)` |
| `clipboard.readText()` + `clipboardListener` | `window.copyPasta.onClipboardText(cb)` |
| `clipboardListener.writeText(t)` | `window.copyPasta.writeClipboard(t)` |

Both subscriptions must be torn down in the `useEffect` cleanup using the returned unsubscribe.

- [ ] **Step 3: Verify the renderer is clean**

```bash
grep -rn "from 'electron'" src/renderer/
```
Expected: no output.

- [ ] **Step 4: Run V1, V2, and manually confirm** copy → appears in list, click → pastes, Escape → hides, tray theme toggle → switches theme.

- [ ] **Step 5: Commit, push, open PR targeting `modernize/01-toolchain`**

---

# Phase 3 — State layer

**Branch:** `modernize/03-state-layer` from `modernize/02-process-model`. **PR target:** `modernize/02-process-model`.

### Task 3.1: History file store in main

**Files:** Create `src/main/history-store.ts`. Modify `src/main/ipc.ts`.

- [ ] **Step 1: Implement it.** Requirements: atomic write (temp + rename), ~250 ms debounce, corrupt/missing file returns defaults instead of throwing.

```ts
import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import type { Item } from '../shared/types';

type Payload = { version: 1; items: Item[]; lightTheme: boolean };
const DEFAULTS: Payload = { version: 1, items: [], lightTheme: false };

const file = () => path.join(app.getPath('userData'), 'history.json');

export async function load(): Promise<Payload> {
  try {
    const raw = await fs.readFile(file(), 'utf8');
    const parsed = JSON.parse(raw) as Payload;
    if (!Array.isArray(parsed.items)) return DEFAULTS;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

let timer: NodeJS.Timeout | null = null;
let pending: Payload | null = null;

export function save(data: Omit<Payload, 'version'>): void {
  pending = { version: 1, ...data };
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

export async function flush(): Promise<void> {
  if (!pending) return;
  const data = pending;
  pending = null;
  const target = file();
  const tmp = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, target);
}
```

- [ ] **Step 2: Register the handlers in `src/main/ipc.ts`**

```ts
ipcMain.handle('history:load', () => load());
ipcMain.handle('history:save', (_e, data) => { save(data); });
```

- [ ] **Step 3: Flush on quit in `src/main/index.ts`**

```ts
app.on('will-quit', (e) => { e.preventDefault(); flush().finally(() => app.exit()); });
```
Guard against re-entry so `app.exit()` isn't blocked twice.

- [ ] **Step 4: Commit**

### Task 3.2: One-time legacy migration

**Files:** Modify `src/renderer/store/clipboardStore.ts` (created in Task 3.3) or a small `src/renderer/store/migrate.ts`.

Legacy data was written by `mobx-persist`'s `hydrate('data', DataStore)` into **renderer
`localStorage` under key `data`**, so the migration must run in the renderer where that origin's
storage is reachable, then hand the result to main via `saveHistory`.

- [ ] **Step 1: Implement**

```ts
import type { Item } from '../../shared/types';

export function readLegacyLocalStorage(): Item[] | null {
  try {
    const raw = localStorage.getItem('data');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const pinnedIds = new Set((parsed.pinnedData ?? []).map((i: any) => i.id));
    const all = [...(parsed.data ?? []), ...(parsed.pinnedData ?? [])];
    const seen = new Set<number>();
    const items: Item[] = [];
    for (const i of all) {
      if (!i || typeof i.id !== 'number' || seen.has(i.id)) continue;
      seen.add(i.id);
      items.push({ id: i.id, text: String(i.text ?? ''), pinned: pinnedIds.has(i.id) });
    }
    return items;
  } catch {
    return null;   // migration must never throw
  }
}
```

- [ ] **Step 2: Call it only when `loadHistory()` returns zero items**, then `saveHistory` the result and `localStorage.removeItem('data')` so it runs once.

- [ ] **Step 3: Commit**

### Task 3.3: Normalized mobx 7 store

**Files:** Create `src/renderer/store/clipboardStore.ts`. Delete `src/renderer/store/dataStore.ts`.

- [ ] **Step 1: Implement.** This replaces the four aliased arrays (bugs 1-4) with one source of truth.

```ts
import { makeAutoObservable, runInAction } from 'mobx';
import type { Item } from '../../shared/types';

const WEEK_MS = 604800000;

export class ClipboardStore {
  items: Item[] = [];
  lightTheme = false;
  hydrated = false;

  constructor() { makeAutoObservable(this) }

  get pinned()   { return this.items.filter(i => i.pinned) }
  get unpinned() { return this.items.filter(i => !i.pinned) }

  /** Newest first, pinned above unpinned. */
  get ordered()  { return [...this.pinned, ...this.unpinned].reverse() }

  results(query: string): Item[] {
    if (!query) return this.ordered;
    const q = query.toLowerCase();
    return this.ordered.filter(i => i.text.toLowerCase().includes(q));  // substring, not regex — bug 6
  }

  add(text: string) {
    if (!text) return;
    this.items.push({ id: Date.now(), text, pinned: false });
  }

  remove(id: number)    { this.items = this.items.filter(i => i.id !== id) }
  togglePin(id: number) {
    const i = this.items.find(x => x.id === id);
    if (i) i.pinned = !i.pinned;          // guarded — bug 2
  }
  clear()       { this.items = [] }
  toggleTheme() { this.lightTheme = !this.lightTheme }

  /** Unpinned items older than a week. Pinned items never expire. */
  clearExpired() {
    const now = Date.now();
    this.items = this.items.filter(i => i.pinned || (now - i.id) < WEEK_MS);
  }
}
```

Note `results()` uses a **substring match, not a RegExp** — that is the fix for bug 6, and it means
no escaping helper is needed.

- [ ] **Step 2: Create `src/renderer/store/persist.ts`** — the ~25-line replacement for `mobx-persist`.

```ts
import { autorun } from 'mobx';
import type { ClipboardStore } from './clipboardStore';

export async function hydrateAndPersist(store: ClipboardStore) {
  const data = await window.copyPasta.loadHistory();
  // ... migration hook from Task 3.2 when data.items.length === 0
  store.items = data.items;
  store.lightTheme = data.lightTheme;
  store.hydrated = true;

  autorun(() => {
    if (!store.hydrated) return;
    void window.copyPasta.saveHistory({
      items: store.items.map(i => ({ ...i })),
      lightTheme: store.lightTheme,
    });
  });
}
```

- [ ] **Step 3: Commit**

### Task 3.4: React 19 root + mobx-react 10 wiring

**Files:** Modify `src/renderer/App.tsx`, `src/renderer/pages/Landing.tsx`

- [ ] **Step 1: `ReactDOM.render` is removed in React 19** (bug 11) — use `createRoot`.

```tsx
import { createRoot } from 'react-dom/client';
import { ClipboardStore } from './store/clipboardStore';
import { hydrateAndPersist } from './store/persist';
import { Landing } from './pages/Landing';
import './styles/index.scss';

const store = new ClipboardStore();
void hydrateAndPersist(store);

createRoot(document.getElementById('root')!).render(<Landing store={store} />);
```

- [ ] **Step 2: Update `Landing.tsx`** to take `store: ClipboardStore` and read `store.results(query)` / `store.ordered` instead of the four old arrays. Keep `observer` from `mobx-react`.

- [ ] **Step 3: Run V1 and V2. Look at the PNG.** Expected: identical UI.

- [ ] **Step 4: Verify persistence** — copy something, quit, relaunch, confirm it is still listed and `~/Library/Application Support/copy-pasta/history.json` contains it.

- [ ] **Step 5: Verify pin/unpin no longer corrupts** — pin an item, unpin it, confirm it is still present exactly once and that no other item disappeared. This is the regression that motivated the whole phase.

- [ ] **Step 6: Commit, push, open PR targeting `modernize/02-process-model`**

---

# Phase 4 — Bug fixes and cleanup

**Branch:** `modernize/04-bugfixes-cleanup` from `modernize/03-state-layer`. **PR target:** `modernize/03-state-layer`.

### Task 4.1: Fix the interval leak (bug 5)

**Files:** Modify `src/renderer/pages/Landing.tsx`

- [ ] **Step 1:** The old code stored the timer in `useState` and read it from a `[]`-deps cleanup, which always saw `null`. Use a ref-free local instead:

```ts
useEffect(() => {
  const id = setInterval(() => store.clearExpired(), DAY_IN_MILLISECONDS);
  return () => clearInterval(id);
}, [store]);
```

- [ ] **Step 2: Commit**

### Task 4.2: Guard item selection (bug 7)

**Files:** Modify `src/renderer/pages/Landing.tsx`

- [ ] **Step 1:** The old `addToClipboard` read `data[data.length - 1]` unguarded. Replace with:

```ts
const selectItem = (item: Item): void => {
  void window.copyPasta.writeClipboard(item.text);
  window.copyPasta.hideAndPaste();
};
```
Re-adding on select is unnecessary: the clipboard watcher in main will observe the write. Because
`noteWrite` suppresses the echo, selecting an existing item must **not** create a duplicate — verify this.

- [ ] **Step 2: Commit**

### Task 4.3: Replace `react-debounce-input`

**Files:** Create `src/renderer/hooks/useDebouncedValue.ts`. Modify `src/renderer/pages/Landing.tsx`.

- [ ] **Step 1: Implement the hook**

```ts
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delay = 500): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
```

- [ ] **Step 2: Use a plain `<input>`** with local `searchTerm` state, feeding `useDebouncedValue(searchTerm)` into `store.results(...)`. Remove the `react-debounce-input` dependency.

- [ ] **Step 3: Verify typing `(` in the search box does not throw** — this is the bug 6 regression check.

- [ ] **Step 4: Commit**

### Task 4.4: Row cleanup (bugs 12-14) and date formatting

**Files:** Modify `src/renderer/components/Row.tsx`. Delete `src/renderer/models/landingModel.ts`.

- [ ] **Step 1:** Remove the unused `pinIcon` / `unpinIcon` imports (they were never rendered), stop putting a numeric `id` on the DOM node, and fix the inverted `isEven` class:

```tsx
className={`row ${isEven ? 'even' : ''}`}
```

- [ ] **Step 2: Format dates with `Intl`** instead of `dateformat`, deriving from `item.id`:

```ts
const fmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric', minute: '2-digit', second: '2-digit',
  month: 'numeric', day: '2-digit',
});
// fmt.format(new Date(item.id))
```
`date` therefore no longer needs to be stored on `Item`.

- [ ] **Step 3: Delete dead code**

```bash
git rm src/renderer/models/landingModel.ts
```

- [ ] **Step 4: Run the linter and V1/V2. Commit, push, open PR targeting `modernize/03-state-layer`**

---

# Phase 5 — Auto-updater placement

**Branch:** `modernize/05-autoupdate-placement` from `modernize/04-bugfixes-cleanup`. **PR target:** `modernize/04-bugfixes-cleanup`.

### Task 5.1: Move the version code to the renderer (bug 10)

**Files:** Modify `src/main/index.ts`, `src/renderer/pages/Landing.tsx`

- [ ] **Step 1: Delete the misplaced block from `src/main/index.ts`.** These lines reference `document` and `ipcRenderer`, neither of which exists in the main process; they throw a `ReferenceError` that Electron swallows, which is why `ready-to-show` and both `autoUpdater` handlers never register:

```ts
const version = document.getElementById('version');
ipcRenderer.send('app_version');
ipcRenderer.on('app_version', …);
```

Also remove `ipcRenderer` from the `electron` import on line 1.

- [ ] **Step 2: Render the version in the renderer** using the bridge:

```ts
useEffect(() => {
  void window.copyPasta.getVersion().then(v => {
    const el = document.getElementById('version');
    if (el) el.textContent = `Version ${v}`;
  });
}, []);
```

- [ ] **Step 3: Keep update checks dormant.** Leave `electron-updater` installed but do **not** call `checkForUpdatesAndNotify()` — there is no publish provider configured, so it would fail at runtime.

- [ ] **Step 4: Verify** the app starts with no `ReferenceError`, and the version string renders.

- [ ] **Step 5: Commit**

### Task 5.2: File the tracking issue

- [ ] **Step 1: Open it**

```bash
gh issue create --title "Finish auto-update: configure a publish provider" --body "..."
```
The body should record: the code is now correctly placed and dormant; finishing it requires a
publish provider (GitHub Releases against `etcetera8/copy-pasta`), a release workflow, and calling
`autoUpdater.checkForUpdatesAndNotify()` on `ready-to-show`; and that the feature has never worked
in any released build.

- [ ] **Step 2: Push and open PR targeting `modernize/04-bugfixes-cleanup`, referencing the issue**

---

## Self-Review Notes

**Spec coverage.** Every section of the design maps to tasks: §2 stack → 1.1; §3 process architecture
→ 2.1-2.5; §4 data model → 3.3; §5 storage → 3.1-3.2; §6 bugs 1-4 → 3.3, bug 5 → 4.1, bug 6 → 3.3
(substring match), bug 7 → 4.2, bugs 8-9 → 1.4, bug 10 → 5.1, bug 11 → 3.4, bugs 12-14 → 4.4,
bug 15 → 4.4, bug 16 → 1.5; §7 layout → 1.3; §8 phases → the five phase headings.

**Known deviation from the writing-plans skill.** The skill prescribes TDD. The user explicitly scoped
this work without a test suite, and user instruction takes precedence over skill guidance. Verification
is therefore V1/V2/V3 against the running app rather than automated tests. The residual risk — that
pin/unpin, expiry and dedupe are rewritten without regression coverage — is recorded in spec §9 and
was accepted.

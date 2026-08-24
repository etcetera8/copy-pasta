# Update Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dormant `electron-updater` wiring with a startup check against the GitHub Releases API that appends "N.N.N available" to the existing version line, opening the release page in the user's browser when clicked.

**Architecture:** One main-process module (`update-check.ts`) fetches the latest release once and memoizes the *promise*. Two IPC channels hand that promise and a page-open action to the renderer through the preload bridge. The existing `Version` component gains a second effect that awaits the promise and renders a suffix. Every failure path resolves to `null` — nothing throws into main.

**Tech Stack:** Electron 43 (Node 22 in main, global `fetch`), TypeScript 6 strict, Vitest 4, React 19, Sass.

**Spec:** `docs/superpowers/specs/2026-08-24-update-notification-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/main/update-check.ts` | **Create.** Version comparator, release fetch, memoized promise, release URL |
| `src/main/update-check.test.ts` | **Create.** Comparator table + every failure path |
| `src/shared/types.ts` | **Modify.** `UpdateInfo`, two new `CopyPastaApi` members |
| `src/main/ipc.ts` | **Modify.** `update:check`, `update:open` |
| `src/main/index.ts` | **Modify.** Remove the `electron-updater` block; start the check on `ready-to-show` |
| `src/preload/index.ts` | **Modify.** `getUpdateInfo`, `openReleasePage` |
| `src/renderer/components/Version.tsx` | **Modify.** Render the suffix |
| `src/renderer/components/Version.test.tsx` | **Modify.** Extend the stub helper, add suffix cases |
| `src/renderer/styles/version.scss` | **Modify.** Style the link |
| `vite.main.config.mts` | **Modify.** Drop the `electron-updater` external |
| `package.json` | **Modify.** Drop the `electron-updater` dependency |
| `README.md` | **Modify.** Replace the "dormant" line |

**Note on `Version.test.tsx`:** its `stubGetVersion` helper currently assigns `window.copyPasta = { getVersion }` and nothing else. Once `Version` also calls `getUpdateInfo()`, all four existing tests throw `TypeError: getUpdateInfo is not a function`. Task 7 fixes the helper *before* touching the component.

---

## Task 1: Version comparator

Pure functions, no Electron, no network. Everything else builds on these.

**Files:**
- Create: `src/main/update-check.ts`
- Create: `src/main/update-check.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/main/update-check.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isNewer, parseVersion } from './update-check';

describe('parseVersion', () => {
  it('parses a bare triple', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
  });

  it('parses a v-prefixed triple', () => {
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3]);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseVersion('  v1.2.3  ')).toEqual([1, 2, 3]);
  });

  it.each([
    ['1.2', 'two components'],
    ['1.2.3.4', 'four components'],
    ['1.2.x', 'non-numeric component'],
    ['v1.2.3-beta.1', 'prerelease suffix'],
    ['release-1.2.3', 'unrecognised prefix'],
    ['', 'empty string'],
  ])('returns null for %s (%s)', (tag) => {
    expect(parseVersion(tag)).toBeNull();
  });
});

describe('isNewer', () => {
  it.each([
    ['1.0.1', '1.0.0', 'patch bump'],
    ['1.1.0', '1.0.9', 'minor bump beats a higher patch'],
    ['2.0.0', '1.9.9', 'major bump beats everything below'],
    ['v1.1.0', '1.0.0', 'v prefix on the tag'],
  ])('%s is newer than %s (%s)', (tag, current) => {
    expect(isNewer(tag, current)).toBe(true);
  });

  it.each([
    ['1.0.0', '1.0.0', 'equal is not newer'],
    ['1.0.0', '1.0.1', 'older patch'],
    ['1.0.9', '1.1.0', 'older minor'],
    ['1.9.9', '2.0.0', 'older major'],
  ])('%s is not newer than %s (%s)', (tag, current) => {
    expect(isNewer(tag, current)).toBe(false);
  });

  it('is false when the tag does not parse, rather than guessing', () => {
    expect(isNewer('nightly', '1.0.0')).toBe(false);
  });

  it('is false when the running version does not parse', () => {
    expect(isNewer('9.9.9', 'unknown')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/main/update-check.test.ts
```

Expected: FAIL — `Failed to resolve import "./update-check"`.

- [ ] **Step 3: Write the comparator**

Create `src/main/update-check.ts`:

```ts
/** `major.minor.patch`, with an optional `v`. Nothing else counts. */
const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;

/**
 * A release tag as three integers, or `null` if it is not a clean triple.
 *
 * `/releases/latest` excludes drafts and prereleases server-side, so there are
 * no prerelease suffixes to rank here. Anything that does not match is treated
 * as unknown rather than guessed at -- a tag we cannot read must never be
 * reported to the user as an upgrade.
 */
export function parseVersion(tag: string): [number, number, number] | null {
  const match = VERSION.exec(tag.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** True only when `tag` is strictly greater than `current`. */
export function isNewer(tag: string, current: string): boolean {
  const a = parseVersion(tag);
  const b = parseVersion(current);
  if (!a || !b) return false;

  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/main/update-check.test.ts
```

Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/update-check.ts src/main/update-check.test.ts
git commit -m "Add version comparator for update checks

parseVersion returns null for anything that is not a clean major.minor.patch
triple, and isNewer is false whenever either side fails to parse. A tag we
cannot read must never be reported to the user as an upgrade.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: The release check

The memoized fetch and every failure path. This is the task the whole issue is about: nothing here may throw or reject.

**Files:**
- Modify: `src/main/update-check.ts`
- Modify: `src/main/update-check.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add the `UpdateInfo` type**

In `src/shared/types.ts`, add above `CopyPastaApi`:

```ts
/**
 * A published release newer than the running app.
 *
 * The release URL is deliberately absent: `openReleasePage()` takes no
 * argument, so main opens the URL it already holds rather than one the
 * renderer hands it. See the design doc, section 7.
 */
export type UpdateInfo = {
  /** Release tag with any leading `v` stripped -- e.g. "1.1.0". */
  version: string;
};
```

- [ ] **Step 2: Write the failing tests**

Replace the import line at the top of `src/main/update-check.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isNewer, parseVersion } from './update-check';
```

Then append these blocks to the end of the file:

```ts
// `checkForUpdate` reads `app.getVersion()` and memoizes its promise for the
// life of the module, so each test re-imports a fresh copy via `vi.resetModules`.
const mocks = vi.hoisted(() => ({
  version: '1.0.0',
  openExternal: vi.fn(),
}));

vi.mock('electron', () => ({
  app: { getVersion: () => mocks.version },
  shell: { openExternal: mocks.openExternal },
}));

/** A fresh module instance, so one test's memoized promise cannot leak. */
async function freshModule() {
  vi.resetModules();
  return import('./update-check');
}

/** Stub `fetch` with a single JSON response. */
function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const release = (tag: string) => ({
  tag_name: tag,
  html_url: `https://github.com/etcetera8/copy-pasta/releases/tag/${tag}`,
});

beforeEach(() => {
  mocks.version = '1.0.0';
  mocks.openExternal.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkForUpdate', () => {
  it('reports a release newer than the running version', async () => {
    stubFetch(200, release('v1.1.0'));
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toEqual({ version: '1.1.0' });
  });

  it('strips the v so the renderer never has to', async () => {
    stubFetch(200, release('v2.0.0'));
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toEqual({ version: '2.0.0' });
  });

  it('reports nothing when the latest release is the running version', async () => {
    stubFetch(200, release('v1.0.0'));
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it('reports nothing when the latest release is older', async () => {
    mocks.version = '2.0.0';
    stubFetch(200, release('v1.0.0'));
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  // This is the path that runs today: the repo has no releases at all.
  it('resolves null on 404 rather than rejecting', async () => {
    stubFetch(404, { message: 'Not Found' });
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it('resolves null when rate limited', async () => {
    stubFetch(403, { message: 'API rate limit exceeded' });
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it('resolves null when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it('resolves null when the request times out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    }));
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it('resolves null when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    })));
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it('resolves null when tag_name is missing', async () => {
    stubFetch(200, { html_url: 'https://example.com' });
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it('resolves null when tag_name is not a string', async () => {
    stubFetch(200, { tag_name: 42 });
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it('resolves null when the tag is not a clean triple', async () => {
    stubFetch(200, release('nightly-build'));
    const { checkForUpdate } = await freshModule();

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it('requests the latest release, unauthenticated', async () => {
    const fetchMock = stubFetch(200, release('v1.1.0'));
    const { checkForUpdate } = await freshModule();
    await checkForUpdate();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/etcetera8/copy-pasta/releases/latest');
    expect(init.headers).toMatchObject({ Accept: 'application/vnd.github+json' });
    // A token in a distributed desktop binary would be worse than pointless.
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
    // Bounded, so a hung connection cannot leave the renderer awaiting forever.
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('fetches once however many callers ask', async () => {
    const fetchMock = stubFetch(200, release('v1.1.0'));
    const { checkForUpdate } = await freshModule();

    const [a, b, c] = await Promise.all([checkForUpdate(), checkForUpdate(), checkForUpdate()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ version: '1.1.0' });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('hands a late caller the settled result', async () => {
    stubFetch(200, release('v1.1.0'));
    const { checkForUpdate } = await freshModule();

    await checkForUpdate();

    // The renderer may mount well after ready-to-show fired. It still gets
    // the answer -- this is why the promise is handed out, not an event.
    await expect(checkForUpdate()).resolves.toEqual({ version: '1.1.0' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx vitest run src/main/update-check.test.ts
```

Expected: FAIL — every `checkForUpdate` test errors with `checkForUpdate is not a function`.

- [ ] **Step 4: Implement the check**

Append to `src/main/update-check.ts`, and add the import at the top of the file:

```ts
import { app } from 'electron';
import type { UpdateInfo } from '../shared/types';
```

```ts
const RELEASES_API = 'https://api.github.com/repos/etcetera8/copy-pasta/releases/latest';

// A hung connection would otherwise leave the promise pending forever, and the
// renderer awaits that same promise -- the version line would stay blank for
// the life of the session instead of falling back to showing just the version.
const TIMEOUT_MS = 10_000;

/** The release page for the update found, if any. Never crosses the bridge. */
let releaseUrl: string | null = null;

/** The one in-flight or settled check. */
let pending: Promise<UpdateInfo | null> | null = null;

/**
 * Every failure resolves to `null`. Nothing here throws, and nothing rejects.
 *
 * That is the whole point of this module. An uncaught exception in main halts
 * its work while the process stays alive: no `ipcMain` handler answers, and a
 * renderer awaiting one hangs forever. With `app.dock.hide()` there is no
 * visible crash and `npm start` still prints a clean log, so a dead main
 * process is externally indistinguishable from a healthy one. The old
 * `checkForUpdatesAndNotify()` was left uncalled precisely because it could
 * emit an unhandled `error`; the replacement must not reintroduce that.
 */
async function fetchLatest(): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 404 when no release has been published yet -- the repo's state today,
    // so this is the branch that actually runs on launch. 403/429 when rate
    // limited. Either way there is simply nothing to report.
    if (!response.ok) return null;

    const body: unknown = await response.json();
    const { tag_name: tag, html_url: url } = (body ?? {}) as {
      tag_name?: unknown;
      html_url?: unknown;
    };

    if (typeof tag !== 'string' || !isNewer(tag, app.getVersion())) return null;

    releaseUrl = typeof url === 'string' ? url : null;
    // `isNewer` only returns true for a tag matching VERSION, so this leaves
    // exactly the triple behind.
    return { version: tag.replace(/^v/, '') };
  } catch {
    // Offline, DNS failure, timeout, malformed JSON. All the same to us.
    return null;
  }
}

/**
 * The result of the single update check, starting it if it has not run.
 *
 * Callers share one promise rather than one event. An event would have to be
 * sent before anyone is listening -- the window is created with `show: false`
 * and the check starts on `ready-to-show`, so a renderer that mounts a moment
 * later would miss it permanently. Handing out the promise inverts that: the
 * first caller awaits the request, everyone after gets the settled value.
 */
export function checkForUpdate(): Promise<UpdateInfo | null> {
  pending ??= fetchLatest();
  return pending;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/main/update-check.test.ts
```

Expected: PASS, 34 tests.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/main/update-check.ts src/main/update-check.test.ts src/shared/types.ts
git commit -m "Check GitHub Releases for a newer version

Every failure path resolves to null: 404 (the repo's state today), rate
limiting, offline, timeout, malformed JSON, missing or unparseable tag.
Nothing throws into main, because an uncaught exception there halts the
process while it still looks healthy from outside.

Callers share one promise rather than one event. The window is created with
show: false and the check starts on ready-to-show, so an event would fire
before the renderer mounts its listener and be lost permanently.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Opening the release page

**Files:**
- Modify: `src/main/update-check.ts`
- Modify: `src/main/update-check.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/main/update-check.test.ts`:

```ts
describe('openReleasePage', () => {
  it('opens the release found by the check', async () => {
    stubFetch(200, release('v1.1.0'));
    const { checkForUpdate, openReleasePage } = await freshModule();
    await checkForUpdate();

    openReleasePage();

    expect(mocks.openExternal).toHaveBeenCalledWith(
      'https://github.com/etcetera8/copy-pasta/releases/tag/v1.1.0',
    );
  });

  it('does nothing when no update was found', async () => {
    stubFetch(404, { message: 'Not Found' });
    const { checkForUpdate, openReleasePage } = await freshModule();
    await checkForUpdate();

    openReleasePage();

    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it('does nothing when the check has not run', async () => {
    stubFetch(200, release('v1.1.0'));
    const { openReleasePage } = await freshModule();

    openReleasePage();

    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it('does nothing when the release carried no url', async () => {
    stubFetch(200, { tag_name: 'v1.1.0' });
    const { checkForUpdate, openReleasePage } = await freshModule();
    await checkForUpdate();

    openReleasePage();

    expect(mocks.openExternal).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/main/update-check.test.ts -t openReleasePage
```

Expected: FAIL — `openReleasePage is not a function`.

- [ ] **Step 3: Implement it**

Change the electron import at the top of `src/main/update-check.ts`:

```ts
import { app, shell } from 'electron';
```

Append to the file:

```ts
/**
 * Open the release page for the update found, in the user's browser.
 *
 * Takes no argument on purpose. The renderer cannot hand main a URL to open:
 * passing a renderer-supplied string to `shell.openExternal` is exactly the
 * open-ended capability this app's preload bridge exists to avoid. Main opens
 * the URL it already holds from its own check, or does nothing.
 */
export function openReleasePage(): void {
  if (releaseUrl) void shell.openExternal(releaseUrl);
}
```

- [ ] **Step 4: Run the full file to verify it passes**

```bash
npx vitest run src/main/update-check.test.ts
```

Expected: PASS, 38 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/update-check.ts src/main/update-check.test.ts
git commit -m "Open the release page from main, not from a renderer URL

openReleasePage takes no argument. Passing a renderer-supplied string to
shell.openExternal is the kind of open-ended capability the preload bridge
exists to avoid, so main opens the URL it already holds instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: IPC channels and the preload bridge

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Extend the API type**

In `src/shared/types.ts`, change the import-facing type. Add these two members to `CopyPastaApi`, after `getVersion`:

```ts
  getVersion: () => Promise<string>;
  /** Resolves `null` when there is no newer release, or the check failed. */
  getUpdateInfo: () => Promise<UpdateInfo | null>;
  /** Opens the release page main found. No-op when there is no update. */
  openReleasePage: () => void;
```

- [ ] **Step 2: Add the handlers**

In `src/main/ipc.ts`, add the import:

```ts
import { checkForUpdate, openReleasePage } from './update-check';
```

Add inside `registerIpc()`, after the `app:version` handler:

```ts
  // Returns the memoized promise, so a renderer that mounts after the check
  // already resolved still gets the answer.
  ipcMain.handle('update:check', () => checkForUpdate());

  ipcMain.on('update:open', () => {
    openReleasePage();
  });
```

- [ ] **Step 3: Expose them on the bridge**

In `src/preload/index.ts`, add to the `api` object after `getVersion`:

```ts
  getVersion: () => ipcRenderer.invoke('app:version'),
  getUpdateInfo: () => ipcRenderer.invoke('update:check'),
  openReleasePage: () => ipcRenderer.send('update:open'),
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no output, exit 0. `CopyPastaApi` is the contract both sides are checked against, so a mismatch fails here.

- [ ] **Step 5: Lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/ipc.ts src/preload/index.ts
git commit -m "Bridge the update check to the renderer

update:check hands out the memoized promise; update:open is a fire-and-forget
send that carries no arguments.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Start the check, remove electron-updater from main

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Remove the import**

In `src/main/index.ts`, delete this line:

```ts
import { autoUpdater } from 'electron-updater';
```

Add, next to the other local imports:

```ts
import { checkForUpdate } from './update-check';
```

- [ ] **Step 2: Replace the auto-updater region**

Delete the entire block from `//#region auto-updater` through `//#endregion` — the two comment paragraphs, both `autoUpdater.on(...)` listeners, and the region markers. Replace it with:

```ts
  // One update check per launch, once the renderer has painted. No timer: a
  // check per launch is enough for an app that ships rarely, and this codebase
  // has already shipped one leaked `setInterval` that outlived every unmount
  // (see `Landing.tsx`). Nothing here can leak.
  //
  // `electron-updater` used to sit here with two listeners that never fired.
  // It is electron-builder's updater -- it reads metadata electron-forge does
  // not emit -- and its macOS path needs a Developer ID signature this app
  // does not have. It is gone; `update-check` reports a new release and the
  // user installs it themselves.
  mainWindow.once('ready-to-show', () => {
    // Fire and forget: the result is collected over `update:check`, and
    // `checkForUpdate` never rejects.
    void checkForUpdate();
  });
```

- [ ] **Step 3: Verify no reference survives**

```bash
grep -rn "electron-updater\|autoUpdater" src/
```

Expected: no output.

- [ ] **Step 4: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "Start the update check on ready-to-show

Replaces the electron-updater block, whose two listeners never fired and whose
channels no renderer could reach. One check per launch, no timer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Render the suffix

The existing stub helper must be fixed first, or all four current tests break.

**Files:**
- Modify: `src/renderer/components/Version.test.tsx`
- Modify: `src/renderer/components/Version.tsx`

- [ ] **Step 1: Widen the existing stub helper**

In `src/renderer/components/Version.test.tsx`, replace the `stubGetVersion` function with:

```tsx
import type { UpdateInfo } from '../../shared/types';

/**
 * `Version` reaches for `getVersion` and `getUpdateInfo`, so the stub has to
 * provide both -- a partial bridge would throw inside the effect rather than
 * fail the assertion under test.
 */
function stubBridge(opts: {
  version?: () => Promise<string>;
  update?: () => Promise<UpdateInfo | null>;
} = {}) {
  const getVersion = vi.fn(opts.version ?? (() => Promise.resolve('1.0.0')));
  const getUpdateInfo = vi.fn(opts.update ?? (() => Promise.resolve(null)));
  const openReleasePage = vi.fn();
  (window as any).copyPasta = { getVersion, getUpdateInfo, openReleasePage };
  return { getVersion, getUpdateInfo, openReleasePage };
}
```

Update the four existing tests to call it. The replacements, in order:

```tsx
    stubBridge({ version: () => Promise.resolve('4.2.0') });
```
```tsx
    const { getVersion } = stubBridge({ version: () => Promise.resolve('9.9.9') });
```
```tsx
    stubBridge({ version: () => new Promise<string>((resolve) => { answer = resolve; }) });
```
```tsx
    stubBridge({ version: () => Promise.reject(new Error('no main')) });
```

- [ ] **Step 2: Run to confirm the existing four still pass**

```bash
npx vitest run src/renderer/components/Version.test.tsx
```

Expected: PASS, 4 tests. The component has not changed yet; this proves the helper swap is behaviour-neutral.

- [ ] **Step 3: Write the failing tests**

Append inside the `describe('Version', ...)` block:

```tsx
  it('shows nothing extra when there is no update', async () => {
    stubBridge({ version: () => Promise.resolve('1.0.0') });

    render(<Version />);

    expect(await screen.findByText(/Version 1\.0\.0/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('offers the new version when one exists', async () => {
    stubBridge({
      version: () => Promise.resolve('1.0.0'),
      update: () => Promise.resolve({ version: '1.1.0' }),
    });

    render(<Version />);

    expect(await screen.findByRole('button', { name: '1.1.0 available' })).toBeTruthy();
    // The running version stays visible alongside it.
    expect(screen.getByText(/Version 1\.0\.0/)).toBeTruthy();
  });

  it('asks main to open the release page when clicked', async () => {
    const { openReleasePage } = stubBridge({
      version: () => Promise.resolve('1.0.0'),
      update: () => Promise.resolve({ version: '1.1.0' }),
    });

    render(<Version />);
    (await screen.findByRole('button', { name: '1.1.0 available' })).click();

    // No argument: main opens the URL it already holds.
    expect(openReleasePage).toHaveBeenCalledTimes(1);
    expect(openReleasePage).toHaveBeenCalledWith();
  });

  it('stays quiet when the update check cannot answer', async () => {
    stubBridge({
      version: () => Promise.resolve('1.0.0'),
      update: () => Promise.reject(new Error('no main')),
    });

    render(<Version />);

    expect(await screen.findByText(/Version 1\.0\.0/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  it('shows the version even while the update check is still pending', async () => {
    stubBridge({
      version: () => Promise.resolve('1.0.0'),
      update: () => new Promise(() => { /* never settles */ }),
    });

    render(<Version />);

    // The version must not wait on the update check.
    expect(await screen.findByText(/Version 1\.0\.0/)).toBeTruthy();
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
npx vitest run src/renderer/components/Version.test.tsx
```

Expected: FAIL — `getUpdateInfo` is never called, so no button renders.

- [ ] **Step 5: Implement**

Two edits to `src/renderer/components/Version.tsx`. Leave the existing doc
comment above the component exactly as it is — it explains bug 10 and is still
accurate.

First, add one import to the block at the top of the file:

```tsx
import { FC, useEffect, useState } from 'react';
import type { UpdateInfo } from '../../shared/types';
import '../styles/version.scss';
```

Then replace everything from `export const Version` to the end of the file with:

```tsx
export const Version: FC = () => {
  const [version, setVersion] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    let live = true;

    void window.copyPasta
      .getVersion()
      .then((v) => {
        if (live) setVersion(v);
      })
      .catch(() => {
        // Main is the only source for this; if it cannot answer there is
        // nothing to show. Swallowed rather than left to reject unhandled.
      });

    return () => {
      live = false;
    };
  }, []);

  // Separate from the version fetch so a slow or failed update check can never
  // hold back the version string.
  useEffect(() => {
    let live = true;

    void window.copyPasta
      .getUpdateInfo()
      .then((info) => {
        if (live) setUpdate(info);
      })
      .catch(() => {
        // No update to offer. Silence is the correct outcome.
      });

    return () => {
      live = false;
    };
  }, []);

  if (version === null) return null;

  return (
    <p className="version">
      {`Version ${version}`}
      {update && (
        <>
          {' · '}
          {/* A button, not a link: there is no href to follow. Main holds the
              URL, and this only asks it to open. */}
          <button
            type="button"
            className="update-link"
            onClick={(): void => window.copyPasta.openReleasePage()}
          >
            {`${update.version} available`}
          </button>
        </>
      )}
    </p>
  );
};
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run src/renderer/components/Version.test.tsx
```

Expected: PASS, 9 tests.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/components/Version.tsx src/renderer/components/Version.test.tsx
git commit -m "Offer the new version on the version line

Two effects rather than one, so a slow or failed update check cannot hold back
the version string. The stub helper in the tests now provides the whole bridge:
a partial one throws inside the effect instead of failing the assertion.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Style the link

**Files:**
- Modify: `src/renderer/styles/version.scss`

- [ ] **Step 1: Add the rule**

Append to `src/renderer/styles/version.scss`:

```scss
// A button for semantics, styled as inline text: it sits mid-sentence in the
// version line, so it must not look or space like a control.
.update-link {
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    opacity: 1;
  }
}
```

- [ ] **Step 2: Verify the build still compiles the stylesheet**

```bash
npm run lint && npm test
```

Expected: lint clean, full suite green.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/styles/version.scss
git commit -m "Style the update link as inline text

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Drop the dependency

**Files:**
- Modify: `vite.main.config.mts`
- Modify: `package.json`
- Modify: `README.md`

- [ ] **Step 1: Remove the Rollup external**

In `vite.main.config.mts`, change the externals array to:

```ts
      external: ['robotjs', 'electron', 'electron-squirrel-startup'],
```

- [ ] **Step 2: Remove the dependency**

```bash
npx --yes yarn@1.22.22 remove electron-updater
```

Expected: `package.json` loses the `electron-updater` line and `yarn.lock` is updated.

- [ ] **Step 3: Update the README**

In `README.md`, replace this line:

```
Auto-update is wired but **dormant** — no publish provider is configured yet.
```

with:

```
On launch the app checks GitHub Releases for a newer version. If one exists, the
version line offers it and opens the release page in your browser — downloads are
installed by hand. There is no silent auto-update: that needs a signed macOS
build, which this project does not have.
```

- [ ] **Step 4: Verify nothing references the removed package**

```bash
grep -rn "electron-updater" src/ *.ts *.mts *.json README.md
```

Expected: no output.

- [ ] **Step 5: Full check**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: all three clean, whole suite green.

- [ ] **Step 6: Commit**

```bash
git add package.json yarn.lock vite.main.config.mts README.md
git commit -m "Remove electron-updater

It is electron-builder's updater: it reads app-update.yml and latest-mac.yml,
which electron-forge's makers do not emit. Nothing imports it any more.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Verify in the real app window

Not optional, and not substitutable with a probe. A probe supplies its own main
process and structurally cannot observe a broken one — that is how the original
bug survived four years. Use the `run` skill to launch the actual app.

**Files:**
- Temporarily modify: `src/main/update-check.ts` (reverted in step 4)

- [ ] **Step 1: Verify the silent path — the one that runs today**

```bash
npm start
```

Reach the window with **⌘⇧V**. Confirm, in the real window:

1. The history list renders — proves `history:load` answered, so main is **not** wedged.
2. The version line reads `Version 1.0.0` with **no** suffix — the live endpoint 404s because the repo has no releases.
3. The tray menu opens and "Toggle Light/Dark Mode" works — proves main still answers.

Quit with ⌘Q.

- [ ] **Step 2: Point the check at a repo that has releases**

The populated path cannot be exercised against this repo yet. Temporarily change
`RELEASES_API` in `src/main/update-check.ts` to a public repo that publishes
`major.minor.patch` tags:

```ts
const RELEASES_API = 'https://api.github.com/repos/electron/electron/releases/latest';
```

- [ ] **Step 3: Verify the populated path**

```bash
npm start
```

Reach the window with **⌘⇧V**. Confirm:

1. The version line now reads `Version 1.0.0 · <N>.<N>.<N> available`.
2. Clicking the suffix opens the Electron release page **in the default browser**, not in an app window — proves `shell.openExternal` and the no-argument channel.
3. The history list still renders and the tray still responds.

Quit with ⌘Q.

- [ ] **Step 4: Revert the endpoint**

```bash
git checkout src/main/update-check.ts
grep -n "RELEASES_API =" src/main/update-check.ts
```

Expected: the line points at `etcetera8/copy-pasta` again.

- [ ] **Step 5: Final full check**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: all clean.

- [ ] **Step 6: Confirm the tree is clean**

```bash
git status --short
```

Expected: no output. The temporary edit from step 2 must not be committed.

# Update Notification — Design

**Date:** 2026-08-24
**Status:** Approved
**Issue:** #28 (supersedes #15)
**Scope:** Replace the dormant `electron-updater` wiring with a startup check against the GitHub
Releases API that surfaces a link when a newer version exists. No silent install, no code signing,
no release pipeline.

## 1. Background

Auto-update has never worked in any released build. It was added in `7d21be8` (2022-09-11) as
renderer code placed in the main process, which threw a `ReferenceError` before `ready-to-show` or
either `autoUpdater` listener could register. #26 removed the misplaced block; #27 rebuilt the
version display as a renderer component. What remained was two inert listeners and an
`electron-updater` dependency nothing calls.

Issue #28 proposed finishing the original design: configure a publish provider, add a release
workflow, and call `checkForUpdatesAndNotify()`. Two findings during design rule that out.

### `electron-updater` cannot read Electron Forge's output

`electron-updater` is electron-builder's updater. It reads `app-update.yml` from
`process.resourcesPath` (`node_modules/electron-updater/out/AppUpdater.js:157`) and fetches
`latest-mac.yml` from the release (`out/providers/GitHubProvider.js:139`). Both files are generated
by **electron-builder** at package time.

This project builds with **electron-forge**. Its makers emit `.dmg`, `.zip`, Squirrel
`.nupkg` + `RELEASES`, `.deb`, and `.rpm` — and neither `app-update.yml` nor `latest-mac.yml`.
Adding `@electron-forge/publisher-github`, as issue #28 step 1 describes, publishes artifacts
`electron-updater` has no metadata to interpret. The feature would stay just as broken, but would
now fail at runtime instead of lying dormant.

### macOS auto-update requires a paid signing identity

`MacUpdater.js:16` delegates to `require("electron").autoUpdater` — Squirrel.Mac — which refuses to
apply an update whose Developer ID signature does not match the running app's. Unsigned builds
cannot auto-update on macOS, and no amount of feed configuration changes that.

That constraint is decisive here because the app is macOS-only in practice:

| Code | Why it is macOS-only |
|---|---|
| `app.dock?.hide()` | no dock elsewhere |
| `robot.keyTap('v', 'command')` | hardcoded Command modifier |
| `Command+Q`, `Alt+Command+I` | tray accelerators |
| `MakerDMG`, `MakerZIP(['darwin'])` | the shipped artifacts |

Squirrel.Windows does update unsigned, but a Windows-only auto-updater would serve nobody.

**Decision:** ship update *notifications* instead. Honest about what it does, works unsigned, and
carries none of the above. `electron-updater` is removed rather than reconfigured.

## 2. What is deliberately not built

| Deferred | Why |
|---|---|
| Silent download + install | needs Squirrel.Mac, needs signing |
| Code signing / notarization | requires an Apple Developer ID ($99/yr) |
| Release workflow | separate concern; tracked separately |
| Periodic re-check | startup-only chosen; see §6 |

Until a release is actually published, the check returns 404 and the UI stays silent. That is
correct behavior, and it means the visible result of this work is *nothing appearing* until the
first release is cut. §8 covers proving the populated path anyway.

## 3. Architecture

Four units, each usable and testable on its own.

| Unit | Responsibility | Depends on |
|---|---|---|
| `src/main/update-check.ts` | fetch latest release, compare versions, hold result | `app.getVersion()`, `fetch` |
| `src/main/ipc.ts` | channels `update:check`, `update:open` | update-check |
| `src/preload/index.ts` | `getUpdateInfo()`, `openReleasePage()` | — |
| `src/renderer/components/Version.tsx` | render the suffix when an update exists | bridge |

### Data flow

Main starts one check on `ready-to-show` and keeps the **promise**. The IPC handler hands out that
same promise. The renderer awaits it inside the effect `Version` already has.

```
ready-to-show ──> checkForUpdate() ──> Promise<UpdateInfo | null>  (held in module scope)
                                              │
renderer mount ──> getUpdateInfo() ──> ipcMain.handle('update:check') ──┘
                                              │
                                              ▼
                                    "Version 1.0.0 · 1.1.0 available"
```

### Why a pull, not a push

Issue #28 point 5 assumes the push shape the original code used —
`webContents.send('update_available')` — bridged through preload. That shape has an ordering bug:
if the check resolves before the renderer mounts its listener, the event is lost and the user never
learns about the update. The window is created with `show: false` and the check fires on
`ready-to-show`, so this race is live, not theoretical.

Handing out a memoized promise inverts the direction. The renderer asks; it gets the answer
whenever the answer exists, regardless of which side finished first. The first caller awaits the
in-flight request, later callers get the settled value immediately. No event ordering, no polling,
no listener teardown.

It also matches what is already there: `getVersion()` is a pull, and `Version` already fetches on
mount. The update info rides the same effect.

### The endpoint

```
GET https://api.github.com/repos/etcetera8/copy-pasta/releases/latest
Accept: application/vnd.github+json
```

Unauthenticated. The repo is public, so no token is needed, and shipping one in a desktop binary
would be worse than pointless. The unauthenticated limit is 60 requests/hour per IP; one request
per launch is nowhere near it.

`/releases/latest` — not `/releases` — because it already excludes drafts and prereleases
server-side, which is what lets §5 skip prerelease ranking entirely.

Two fields are read from the response:

| Field | Use |
|---|---|
| `tag_name` | compared against `app.getVersion()` (§5) |
| `html_url` | opened by `openReleasePage()` (§7); never sent to the renderer |

## 4. Types

```ts
/** A release newer than the running app. */
export type UpdateInfo = {
  /** Release tag, `v` stripped — e.g. "1.1.0". */
  version: string;
};
```

`CopyPastaApi` gains:

```ts
getUpdateInfo: () => Promise<UpdateInfo | null>;
openReleasePage: () => void;
```

The release URL is deliberately **not** in `UpdateInfo`. See §7.

## 5. Version comparison

No `semver` dependency. Versions here are plain numeric triples, and a small comparator is less
surface than a dep. `/releases/latest` already excludes drafts and prereleases, so there are no
prerelease suffixes to rank.

```
parse("v1.2.3") -> [1, 2, 3]
parse("1.2.3")  -> [1, 2, 3]
parse(anything else) -> null
```

A tag that does not parse as a clean triple is treated as **no update**, never guessed at. Comparison
is element-wise on the three integers; the release must be strictly greater to count.

## 6. Cadence

One check, on `ready-to-show`. No timer.

Startup-only is a deliberate trade. A tray app left running for a month will not notice a release —
but this codebase has already shipped one leaked `setInterval` that outlived every unmount and
reload (see the comment in `Landing.tsx`), and a timer in main would need teardown on `will-quit`
alongside the existing clipboard-watcher and history-flush work. For a utility that ships rarely,
a check per launch is enough, and nothing can leak.

The check runs in development too. `app.getVersion()` returns the `package.json` version whether
packaged or not, and leaving it live is what makes §8's verification possible at all.

## 7. Error handling

This is the substance of the issue, not an afterthought. Every failure resolves to `null`. Nothing
throws, nothing rejects unhandled, nothing reaches main as an uncaught exception.

| Failure | Result |
|---|---|
| 404 — no releases exist | `null` |
| Network unreachable / offline / DNS | `null` |
| 403 / 429 — rate limited | `null` |
| Any other non-200 | `null` |
| Malformed JSON | `null` |
| Missing or unparseable `tag_name` | `null` |
| Latest tag ≤ running version | `null` |

The 404 row is the case that runs **today**: the repo has no releases, so first launch takes that
path every time.

Why this matters more than usual: an uncaught exception in the main process halts main's work while
the process stays alive. No `ipcMain` handler answers, and a renderer awaiting one hangs forever.
With `app.dock.hide()` there is no visible crash and `npm start` still prints a clean log — a dead
main process is externally indistinguishable from a healthy one. That is precisely why
`checkForUpdatesAndNotify()` was left uncalled rather than wired up and left to fail quietly, and
the replacement must not reintroduce the hazard.

A **10-second** timeout bounds the request, via `AbortSignal.timeout(10_000)`. Without it a hung
connection leaves the promise pending forever, and because the renderer awaits that same promise
(§3) the version line would stay blank for the life of the session rather than falling back to
showing the version alone.

### `openReleasePage()` takes no argument

A tightening over issue #28. The renderer cannot hand main a URL to open — main opens the URL it
already holds from its own check.

Passing a renderer-supplied string to `shell.openExternal` is a bad shape to introduce into a
codebase whose entire preload bridge exists to avoid exactly that kind of open-ended capability.
Omitting the parameter removes the concern outright instead of validating against it. Main stores
the URL from the release it found; if there is no update, the handler does nothing.

## 8. Testing

| Target | Cases |
|---|---|
| comparator | newer, older, equal, `v`-prefixed, malformed, empty, non-numeric |
| `update-check` | 404, 200-newer, 200-same, 200-older, network throw, bad JSON, missing `tag_name`, timeout |
| `Version` | no update → version only; update → suffix present; rejected bridge call → version still renders |

### Verification in the real window

Issue #28 point 6, and it constrains *how*, not just *whether*. Verification happens in the running
app window via the `run` skill — **not** an offscreen probe. A probe supplies its own main process
and structurally cannot observe a broken one; that is how the original bug survived four years
undetected.

Because the live endpoint 404s until a release exists, the populated path is proven by pointing the
check at a fixture response, confirming the suffix renders, then restoring the real endpoint and
confirming the silent 404 path leaves main responsive — history still loads, tray still answers.

## 9. Removals

| Removed | Reason |
|---|---|
| `electron-updater` dependency | wrong updater for this toolchain (§1) |
| `autoUpdater.on('update-available')` | inert listener on a channel no renderer reaches |
| `autoUpdater.on('update-downloaded')` | same |
| The `//#region auto-updater` block in `index.ts` | replaced by §3 |

The README line "Auto-update is wired but **dormant** — no publish provider is configured yet" is
replaced with a description of what the app actually does.

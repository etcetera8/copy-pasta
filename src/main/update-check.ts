import { app, shell } from 'electron';
import type { UpdateInfo } from '../shared/types';

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

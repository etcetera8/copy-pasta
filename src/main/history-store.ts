import { app } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import type { HistoryData } from '../shared/types';

/** What actually sits in `history.json`. `version` lets a future shape migrate. */
export type Payload = { version: 1 } & HistoryData;

const DEFAULTS: Payload = { version: 1, items: [], lightTheme: false };
const DEBOUNCE_MS = 250;

/**
 * Resolved on each call rather than once at module load: `app.getPath` is not
 * usable until the app is ready, and this module is imported before that.
 */
const file = (): string => path.join(app.getPath('userData'), 'history.json');

/**
 * Read the stored history.
 *
 * A missing, truncated or hand-mangled file yields the defaults instead of
 * throwing -- losing history is bad, but refusing to start is worse.
 */
export async function load(): Promise<Payload> {
  try {
    const raw = await fs.readFile(file(), 'utf8');
    const parsed = JSON.parse(raw) as Payload;
    if (!parsed || !Array.isArray(parsed.items)) return DEFAULTS;
    return { ...DEFAULTS, ...parsed, version: 1 };
  } catch {
    return DEFAULTS;
  }
}

let timer: NodeJS.Timeout | null = null;
let pending: Payload | null = null;

/**
 * Writes are serialized through this chain so two flushes can never interleave
 * on the temp file. It is deliberately never rejected: a failed background
 * write is logged, not turned into an unhandled rejection that would take the
 * app down on quit.
 */
let inFlight: Promise<void> = Promise.resolve();

/**
 * Queue a write, coalescing anything that arrives within the debounce window.
 *
 * The renderer saves on every clipboard capture and every pin toggle, so this
 * keeps a burst of changes down to one file write.
 */
export function save(data: HistoryData): void {
  pending = { version: 1, ...data };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void flush();
  }, DEBOUNCE_MS);
}

/**
 * Write any queued payload now. Safe to call at any time -- `app.on('will-quit')`
 * uses it to make sure the last capture survives the quit.
 */
export function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!pending) return inFlight;

  const data = pending;
  pending = null;
  inFlight = inFlight
    .then(() => writeAtomic(data))
    .catch((error) => {
      console.error('copy-pasta: could not write history.json', error);
    });
  return inFlight;
}

/** Write to a temp file and rename, so a crash mid-write cannot truncate history. */
async function writeAtomic(data: Payload): Promise<void> {
  const target = file();
  const tmp = `${target}.tmp`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// `history-store` derives its path from `app.getPath('userData')`. Point that at
// a throwaway directory so the tests never touch the real profile.
const mocks = vi.hoisted(() => ({ userData: '' }));
vi.mock('electron', () => ({ app: { getPath: () => mocks.userData } }));

import { flush, load, save, type Payload } from './history-store';

const DEFAULTS: Payload = { version: 1, items: [], lightTheme: false };
const historyFile = (): string => path.join(mocks.userData, 'history.json');

beforeEach(async () => {
  mocks.userData = await mkdtemp(path.join(os.tmpdir(), 'copy-pasta-history-'));
});

afterEach(async () => {
  // Drain anything a test scheduled so it cannot fire during the next one.
  await flush();
  await rm(mocks.userData, { recursive: true, force: true });
});

describe('history-store load', () => {
  it('returns defaults when the file does not exist', async () => {
    await expect(load()).resolves.toEqual(DEFAULTS);
  });

  it('returns defaults when the file is corrupt instead of throwing', async () => {
    await writeFile(historyFile(), '{not json', 'utf8');

    await expect(load()).resolves.toEqual(DEFAULTS);
  });

  it('returns defaults when items is not an array', async () => {
    await writeFile(historyFile(), JSON.stringify({ version: 1, items: 'nope' }), 'utf8');

    await expect(load()).resolves.toEqual(DEFAULTS);
  });

  it('fills in missing keys from the defaults', async () => {
    await writeFile(historyFile(), JSON.stringify({ items: [] }), 'utf8');

    await expect(load()).resolves.toEqual(DEFAULTS);
  });
});

describe('history-store save', () => {
  const payload = {
    items: [
      { id: 1755980000000, text: 'hello', pinned: false },
      { id: 1755980001000, text: 'pinned one', pinned: true },
    ],
    lightTheme: true,
  };

  it('round-trips a write through the file', async () => {
    save(payload);
    await flush();

    await expect(load()).resolves.toEqual({ version: 1, ...payload });
  });

  it('stamps the payload version on disk', async () => {
    save(payload);
    await flush();

    const raw = JSON.parse(await readFile(historyFile(), 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.items).toHaveLength(2);
  });

  it('debounces: nothing is written synchronously, and only the last payload lands', async () => {
    save({ items: [{ id: 1, text: 'first', pinned: false }], lightTheme: false });
    save({ items: [{ id: 2, text: 'second', pinned: false }], lightTheme: false });

    expect(existsSync(historyFile())).toBe(false);

    await flush();

    const { items } = await load();
    expect(items).toEqual([{ id: 2, text: 'second', pinned: false }]);
  });

  it('writes on its own once the debounce window elapses', async () => {
    save(payload);

    await vi.waitFor(() => expect(existsSync(historyFile())).toBe(true), {
      timeout: 2000,
      interval: 25,
    });
    await expect(load()).resolves.toEqual({ version: 1, ...payload });
  });

  it('leaves no temp file behind, so the write is atomic', async () => {
    save(payload);
    await flush();

    expect(await readdir(mocks.userData)).toEqual(['history.json']);
  });

  it('flushing with nothing pending is a no-op', async () => {
    await expect(flush()).resolves.toBeUndefined();
    expect(existsSync(historyFile())).toBe(false);
  });
});

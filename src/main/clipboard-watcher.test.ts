import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ readText: vi.fn(), send: vi.fn() }));

vi.mock('electron', () => ({
  clipboard: { readText: mocks.readText },
  BrowserWindow: { getAllWindows: () => [{ webContents: { send: mocks.send } }] },
}));

import { startClipboardWatcher, stopClipboardWatcher, noteWrite } from './clipboard-watcher';

const POLL = 500;
const sentTexts = (): string[] =>
  mocks.send.mock.calls.filter((c) => c[0] === 'clipboard:text').map((c) => c[1]);

beforeEach(() => {
  vi.useFakeTimers();
  mocks.readText.mockReset();
  mocks.send.mockReset();
});

afterEach(() => {
  stopClipboardWatcher();
  vi.useRealTimers();
});

describe('clipboard watcher', () => {
  it('pushes newly copied text to renderers', () => {
    mocks.readText.mockReturnValue('');
    startClipboardWatcher();

    mocks.readText.mockReturnValue('hello');
    vi.advanceTimersByTime(POLL);

    expect(sentTexts()).toEqual(['hello']);
  });

  it('does not re-capture text already on the clipboard at startup', () => {
    mocks.readText.mockReturnValue('pre-existing');
    startClipboardWatcher();

    vi.advanceTimersByTime(POLL * 3);

    expect(sentTexts()).toEqual([]);
  });

  // The regression that matters: selecting a row makes the app write to the
  // clipboard. Without noteWrite the next poll reads that write back and stores
  // it as a fresh capture, duplicating the row the user just picked.
  it('does not echo back a write the app made itself', () => {
    mocks.readText.mockReturnValue('A');
    startClipboardWatcher();

    // User picks a row containing 'B' -> ipc handler writes it and notes it.
    noteWrite('B');
    mocks.readText.mockReturnValue('B');
    vi.advanceTimersByTime(POLL);

    expect(sentTexts()).toEqual([]);

    // A genuine external copy afterwards is still captured.
    mocks.readText.mockReturnValue('C');
    vi.advanceTimersByTime(POLL);

    expect(sentTexts()).toEqual(['C']);
  });

  it('ignores an empty clipboard', () => {
    mocks.readText.mockReturnValue('seed');
    startClipboardWatcher();

    mocks.readText.mockReturnValue('');
    vi.advanceTimersByTime(POLL * 2);

    expect(sentTexts()).toEqual([]);
  });

  it('stops polling once stopped', () => {
    mocks.readText.mockReturnValue('');
    const stop = startClipboardWatcher();
    stop();

    mocks.readText.mockReturnValue('after-stop');
    vi.advanceTimersByTime(POLL * 4);

    expect(sentTexts()).toEqual([]);
  });
});

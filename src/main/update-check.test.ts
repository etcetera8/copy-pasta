import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

    // stubFetch's implementation takes no args, so its inferred call-tuple type is `[]`;
    // route through `unknown` to assert the shape the real `fetch` call site actually passes.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
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

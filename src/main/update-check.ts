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

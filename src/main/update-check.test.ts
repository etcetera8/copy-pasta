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

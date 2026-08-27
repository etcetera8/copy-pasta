/**
 * Splits an .icns container into its slices.
 *
 * Shared by tools/check-app-icon.js, which decodes each slice's payload
 * (mostly PNG, via tools/lib/png.js) to check the picture inside, not just
 * the container around it.
 *
 * Deliberately hand-rolled rather than pulled from npm, for the same reason
 * as tools/lib/png.js: this check runs in CI before `yarn install` has any
 * reason to have fetched an icns-reading dependency, and the format is
 * small enough that parsing it here costs less than a dependency would.
 *
 * The format itself: a four-byte 'icns' magic, a big-endian total length
 * covering the whole file, then a flat run of chunks -- each a four-byte
 * type, a big-endian length *including* the eight-byte chunk header it is
 * attached to, then the payload. There is no index; a reader has to walk
 * the chunks in order, which is what the loop below does.
 */

/**
 * @param {Buffer} buf  A complete .icns file.
 * @returns {{ type: string, data: Buffer }[]}
 */
function slices(buf) {
  if (buf.toString('ascii', 0, 4) !== 'icns') throw new Error('not an icns file (bad magic)');
  const declared = buf.readUInt32BE(4);
  if (declared !== buf.length) {
    throw new Error(`header declares ${declared} bytes but the file is ${buf.length}`);
  }
  const found = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const type = buf.toString('ascii', off, off + 4);
    const len = buf.readUInt32BE(off + 4);
    if (len < 8 || off + len > buf.length) throw new Error(`slice '${type}' declares a bad length (${len})`);
    found.push({ type, data: buf.subarray(off + 8, off + len) });
    off += len;
  }
  // The loop condition above (off + 8 <= buf.length) is what lets the walk
  // stop cleanly instead of reading a partial chunk header, but that same
  // leniency would silently swallow 1-7 bytes of junk after the last real
  // chunk -- eight or more already fail the length guard above, since they
  // parse as a header and then fail their own length check, but a shorter
  // tail just falls out of the loop with off short of buf.length and no
  // error. The header check above already treats the *declared* total as
  // authoritative; tolerating slop inside that verified length once the
  // chunks are actually walked would be a lesser version of the same
  // mistake, so it is rejected here too.
  if (off !== buf.length) throw new Error(`${buf.length - off} trailing bytes after the last slice`);
  return found;
}

module.exports = { slices };

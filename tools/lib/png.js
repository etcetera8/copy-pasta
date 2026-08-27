/**
 * A minimal PNG decoder: 8-bit RGBA only, which is all this repo produces.
 *
 * Shared by tools/check-tray-icon.js and tools/check-app-icon.js. It lives
 * here rather than in either of them because both need it and a second copy
 * would drift.
 *
 * Deliberately hand-rolled rather than pulled from npm. These checks run in
 * CI before `yarn install` has any reason to have fetched a dev-only image
 * library, and the format subset needed here is small enough that a
 * dependency would cost more than it saves.
 *
 * Takes a Buffer rather than a path: the icns slices check-app-icon.js
 * inspects are already in memory, and writing them out to temp files purely
 * to read them back would be silly.
 */
const zlib = require('node:zlib');

// Every PNG starts with these eight bytes. Checking them once here, rather
// than trusting off = 8 and walking whatever follows as if it were chunk
// headers, is what turns "handed something that isn't a PNG" into a clear
// error instead of the decoder wandering off into arbitrary bytes.
const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * @param {Buffer} buf  A complete PNG file.
 * @returns {{ w: number, h: number, img: Buffer, stride: number }}
 *          `img` is raw RGBA, 4 bytes per pixel, `stride` bytes per row.
 */
function decode(buf) {
  if (!buf.subarray(0, 8).equals(MAGIC)) throw new Error('not a PNG (bad signature)');

  let off = 8;
  let hdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      hdr = {
        w: buf.readUInt32BE(off + 8),
        h: buf.readUInt32BE(off + 12),
        depth: buf[off + 16],
        color: buf[off + 17],
        // Byte 20 of IHDR (after width, height, depth, colour type,
        // compression method, filter method). Interlaced files are still
        // colour type 6 depth 8, so without checking this they sail past
        // the guard below and get decoded with the wrong scanline layout --
        // no error, just garbage pixels.
        interlace: buf[off + 20],
      };
    }
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  if (!hdr) throw new Error('no IHDR');
  if (hdr.color !== 6 || hdr.depth !== 8) throw new Error(`expected 8-bit RGBA, got colour type ${hdr.color} depth ${hdr.depth}`);
  if (hdr.interlace !== 0) throw new Error(`interlaced PNGs are not supported (interlace method ${hdr.interlace})`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = hdr.w * bpp;

  // A short IDAT stream (a truncated file, or a mismatched IHDR pointing at
  // more rows than the pixel data actually has) must not decode silently.
  // Without this check, reading past the end of `raw` returns `undefined`
  // for both the filter byte and every sample in the row: `undefined`
  // matches no filter branch below (so it is silently treated as filter 0,
  // "None"), and `undefined & 255` is 0, so the missing rows just become
  // transparent black instead of raising an error. That is exactly the kind
  // of half-fabricated image the tray-icon and app-icon checks exist to
  // catch elsewhere in the pixel data -- it should not be possible to sneak
  // one past them via the header instead.
  const need = hdr.h * (stride + 1);
  if (raw.length !== need) {
    throw new Error(`IDAT holds ${raw.length} bytes, expected ${need} for ${hdr.w}x${hdr.h}`);
  }

  const img = Buffer.alloc(hdr.h * stride);
  // Undo the per-scanline filter each row carries in its leading byte.
  for (let y = 0; y < hdr.h; y++) {
    const filter = raw[y * (stride + 1)];
    // filter is loop-invariant across x, so this belongs here -- a
    // once-per-row header validation, checked alongside where the row's
    // other fixed facts (its filter byte, its slice of `raw`) are read --
    // rather than as a fifth arm re-tested on every pixel in the row. PNG
    // defines only 0-4; anything else is a value this format never
    // assigns, and letting it fall through silently as filter 0 (None)
    // would be the same "treat unknown as harmless" mistake the
    // IDAT-length check above exists to close off. The length check
    // guarantees `filter` is never `undefined` here, so `> 4` is exact.
    if (filter > 4) throw new Error(`row ${y}: unknown filter type ${filter}`);
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? img[y * stride + x - bpp] : 0;
      const b = y > 0 ? img[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? img[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      img[y * stride + x] = v & 255;
    }
  }
  // Only the fields callers actually use. `depth` and `color` were tautological
  // above this point -- decode() throws unless they are exactly 8 and 6 -- and
  // returning the whole header struct would have silently exposed `interlace`
  // too.
  return { w: hdr.w, h: hdr.h, img, stride };
}

module.exports = { decode };

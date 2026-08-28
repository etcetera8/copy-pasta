/**
 * Fixtures here are a real PNG's bytes, copied and mutated at known IHDR
 * offsets -- not hand-rolled byte arrays. That is deliberate: a hand-rolled
 * "PNG" risks being wrong about something the decoder does not actually
 * care about, which would test the fixture instead of the guard. Mutating
 * a real, working file at one field keeps every other field honest.
 *
 * This only works because decode() does not verify chunk CRCs -- a mutated
 * field is never repaired against its chunk's CRC below it, so a fixture
 * that decode() would reject purely on a CRC mismatch would defeat the
 * point of testing the guards it actually has. If CRC checking is ever
 * added to the decoder, every fixture built by byte-mutation here needs its
 * chunk's CRC recomputed to match, or these tests start failing for the
 * wrong reason. They would still fail loudly, not pass silently -- the
 * `toThrow(/signature/)`, `/colour type/`, `/interlac/`, `/IDAT holds/`
 * regexes below are specific enough that a CRC error surfacing instead
 * would show up as a test failure, not a false pass -- but the reason
 * would no longer be the one the test name claims.
 *
 * IHDR offsets used below, confirmed against src/main/bowlTemplate.png
 * (signature is 8 bytes, then a 4-byte length + 4-byte "IHDR" type, so
 * IHDR's data starts at byte 16):
 *   16-19 width, 20-23 height, 24 depth, 25 colour type,
 *   26 compression method, 27 filter method, 28 interlace method.
 *
 * This file is .mjs, not .js, even though the rest of tools/ is CommonJS.
 * Vitest cannot be required() from a CommonJS module -- it refuses outright
 * ("Vitest cannot be imported in a CommonJS module using require()") -- so
 * a .js test here would fail before a single test ran. tools/lib/png.js
 * itself stays CommonJS; this file just imports it, which Node's ESM loader
 * handles fine for a module whose export is a plain `module.exports = {...}`.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { decode } from './png.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

function load(name) {
  return fs.readFileSync(path.join(ROOT, 'src', 'main', name));
}

// Splits a PNG into the bytes before its first IDAT chunk, the inflated
// pixel data carried across all of its IDAT chunks, and the bytes after its
// last one (IEND, in practice). Used only by the unknown-filter test below,
// which needs to hand decode() a well-formed IDAT stream containing an
// otherwise-impossible filter byte -- not reachable by mutating a single
// header field the way the other rejection tests do, since the filter byte
// lives inside the compressed pixel data rather than in a fixed offset.
function splitAtIdat(buf) {
  let off = 8;
  let idatStart = -1;
  let idatEnd = -1;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') {
      if (idatStart === -1) idatStart = off;
      idat.push(buf.subarray(off + 8, off + 8 + len));
      idatEnd = off + 12 + len;
    }
    off += 12 + len;
  }
  return {
    prefix: buf.subarray(0, idatStart),
    raw: zlib.inflateSync(Buffer.concat(idat)),
    suffix: buf.subarray(idatEnd),
  };
}

// Rebuilds a PNG from the three pieces splitAtIdat() returned, after the
// caller has mutated `raw`, as a single new IDAT chunk. The CRC is left as
// four zero bytes -- see the file header for why decode() never notices.
function rebuildWithIdat(prefix, raw, suffix) {
  const data = zlib.deflateSync(raw);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write('IDAT', 4, 'ascii');
  data.copy(chunk, 8);
  return Buffer.concat([prefix, chunk, suffix]);
}

describe('decode', () => {
  it('round-trips real PNGs at both sizes this repo ships', () => {
    const small = decode(load('bowlTemplate.png'));
    expect(small.w).toBe(16);
    expect(small.h).toBe(16);
    expect(small.img.length).toBe(16 * 16 * 4);

    const large = decode(load('bowlTemplate@2x.png'));
    expect(large.w).toBe(32);
    expect(large.h).toBe(32);
    expect(large.img.length).toBe(32 * 32 * 4);
  });

  // Two sizes, not one: bowlTemplate.png's scanlines only ever use filter
  // types 1-3 (Sub, Up, Average). bowlTemplate@2x.png is the only fixture
  // that exercises filter type 4, Paeth -- the one branch here with an
  // actual tie-break decision (`pa <= pb && pa <= pc ? a : pb <= pc ? b :
  // c`), where a transcription slip is plausible and would otherwise pass
  // review undetected. Replacing that branch's body with `v += 0` was
  // verified to leave a 16x16-only version of this test suite green.
  it('produces the known-correct pixel counts for bowlTemplate.png, proving the filter-undo loop, not just the output shape', () => {
    const { w, h, img } = decode(load('bowlTemplate.png'));
    const { clear, tinted } = countPixels(img);
    // This exact count is this repo's own baseline, captured by running
    // `node tools/check-tray-icon.js` (46.9% drawn, 136 transparent).
    expect(clear).toBe(136);
    expect(tinted).toBe(0);
    expect(w * h).toBe(256);
  });

  it('produces the known-correct pixel counts for bowlTemplate@2x.png, the fixture that exercises the Paeth predictor', () => {
    const { w, h, img } = decode(load('bowlTemplate@2x.png'));
    const { clear, tinted } = countPixels(img);
    // Same baseline source as above: `node tools/check-tray-icon.js` prints
    // 37.4% drawn, 641 transparent for this file.
    expect(clear).toBe(641);
    expect(tinted).toBe(0);
    expect(w * h).toBe(1024);
  });

  it('rejects a bad signature', () => {
    const buf = Buffer.from(load('bowlTemplate.png'));
    buf[0] = 0x00;
    expect(() => decode(buf)).toThrow(/signature/);
  });

  it('rejects a colour type / bit depth other than 8-bit RGBA', () => {
    const buf = Buffer.from(load('bowlTemplate.png'));
    buf[25] = 2; // colour type 2 is RGB (no alpha channel), not 6 (RGBA)
    expect(() => decode(buf)).toThrow(/colour type/);
  });

  it('rejects an interlaced PNG', () => {
    const buf = Buffer.from(load('bowlTemplate.png'));
    buf[28] = 1; // interlace method 1 is Adam7
    expect(() => decode(buf)).toThrow(/interlac/);
  });

  it('rejects an IHDR whose declared size does not match the IDAT payload', () => {
    const buf = Buffer.from(load('bowlTemplate.png'));
    buf.writeUInt32BE(64, 20); // claim 64 rows; the pixel data underneath is still 16
    expect(() => decode(buf)).toThrow(/IDAT holds/);
  });

  it('rejects a row with an out-of-range filter byte', () => {
    const { prefix, raw, suffix } = splitAtIdat(load('bowlTemplate.png'));
    const stride = 16 * 4;
    raw[0 * (stride + 1)] = 5; // filter types are 0-4; 5 does not exist
    const buf = rebuildWithIdat(prefix, raw, suffix);
    expect(() => decode(buf)).toThrow(/unknown filter type 5/);
  });
});

function countPixels(img) {
  let opaque = 0;
  let clear = 0;
  let tinted = 0;
  for (let i = 0; i < img.length; i += 4) {
    const [r, g, b, a] = [img[i], img[i + 1], img[i + 2], img[i + 3]];
    if (a === 0) clear++;
    else {
      opaque++;
      if (r > 24 || g > 24 || b > 24) tinted++;
    }
  }
  return { opaque, clear, tinted };
}

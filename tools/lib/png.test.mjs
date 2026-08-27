/**
 * Fixtures here are a real PNG's bytes, copied and mutated at known IHDR
 * offsets -- not hand-rolled byte arrays. That is deliberate: a hand-rolled
 * "PNG" risks being wrong about something the decoder does not actually
 * care about, which would test the fixture instead of the guard. Mutating
 * a real, working file at one field keeps every other field honest.
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
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { decode } from './png.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_PNG = path.join(__dirname, '..', '..', 'src', 'main', 'bowlTemplate.png');

function loadReal() {
  return fs.readFileSync(REAL_PNG);
}

describe('decode', () => {
  it('round-trips a real PNG', () => {
    const { w, h, img } = decode(loadReal());
    expect(w).toBe(16);
    expect(h).toBe(16);
    expect(img.length).toBe(16 * 16 * 4);
  });

  it('produces the known-correct pixel counts, proving the filter-undo loop, not just the output shape', () => {
    const { w, h, img } = decode(loadReal());
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
    // These exact counts are this repo's own baseline, captured by running
    // `node tools/check-tray-icon.js` (46.9% drawn, 136 transparent). If the
    // per-scanline filter math regresses, these are the numbers that move
    // even though w/h/img.length would stay identical.
    expect(clear).toBe(136);
    expect(opaque).toBe(w * h - 136);
    expect(tinted).toBe(0);
  });

  it('rejects a bad signature', () => {
    const buf = Buffer.from(loadReal());
    buf[0] = 0x00;
    expect(() => decode(buf)).toThrow(/signature/);
  });

  it('rejects a colour type / bit depth other than 8-bit RGBA', () => {
    const buf = Buffer.from(loadReal());
    buf[25] = 2; // colour type 2 is RGB (no alpha channel), not 6 (RGBA)
    expect(() => decode(buf)).toThrow(/colour type/);
  });

  it('rejects an interlaced PNG', () => {
    const buf = Buffer.from(loadReal());
    buf[28] = 1; // interlace method 1 is Adam7
    expect(() => decode(buf)).toThrow(/interlac/);
  });

  it('rejects an IHDR whose declared size does not match the IDAT payload', () => {
    const buf = Buffer.from(loadReal());
    buf.writeUInt32BE(64, 20); // claim 64 rows; the pixel data underneath is still 16
    expect(() => decode(buf)).toThrow(/IDAT holds/);
  });
});

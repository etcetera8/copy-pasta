/**
 * Fixtures here are the real assets/appIcon.icns bytes, copied and mutated
 * at known offsets -- not hand-rolled byte arrays. Same discipline as
 * tools/lib/png.test.mjs, and for the same reason: a hand-rolled "icns"
 * risks being wrong about something the parser does not actually care
 * about, which would test the fixture instead of the guard. Mutating a
 * real, working file at one field keeps every other field honest.
 *
 * Chunk layout used below, confirmed by walking assets/appIcon.icns as it
 * stood when this file was written (offset, type, declared length):
 *   8      ic12   2456
 *   2464   ic07   5166
 *   7630   ic13   10943
 *   18573  ic08   10943
 *   29516  ic04   566
 *   30082  ic14   24949
 *   55031  ic09   24949
 *   79980  ic05   1286
 *   81266  ic10   62475
 *   143741 ic11   1099
 *   144840 info    318   (ends at 145158, the whole file)
 * If tools/render-app-icon.sh or bowl.svg ever change enough to shift these
 * numbers, the offset-dependent tests below will fail loudly (wrong slice
 * type, or a mutation landing on the wrong field) rather than pass for the
 * wrong reason.
 *
 * This file is .mjs, not .js, even though the rest of tools/ is CommonJS,
 * for the same reason as png.test.mjs: vitest refuses to be require()'d.
 * tools/lib/icns.js itself stays CommonJS; this file just imports it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { slices } from './icns.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

function load() {
  return fs.readFileSync(path.join(ROOT, 'assets', 'appIcon.icns'));
}

describe('slices', () => {
  it('parses the real icon into the slice types the app-icon check reports', () => {
    const found = slices(load());
    const types = found.map((s) => s.type);
    // Matches the PNG / skipped split tools/check-app-icon.js prints for
    // this same file: eight PNG-encoded raster sizes, plus the two legacy
    // 'ARGB' slices and the 'info' bookkeeping chunk it skips.
    expect(types).toEqual(['ic12', 'ic07', 'ic13', 'ic08', 'ic04', 'ic14', 'ic09', 'ic05', 'ic10', 'ic11', 'info']);
  });

  it('rejects a bad magic', () => {
    const buf = Buffer.from(load());
    buf.write('PNG ', 0, 'ascii');
    expect(() => slices(buf)).toThrow(/bad magic/);
  });

  it('rejects a header total that disagrees with the file length', () => {
    const buf = Buffer.from(load());
    buf.writeUInt32BE(buf.length - 1, 4);
    expect(() => slices(buf)).toThrow(/header declares/);
  });

  it('rejects a slice whose declared length is below the eight-byte chunk header', () => {
    const buf = Buffer.from(load());
    buf.writeUInt32BE(4, 12); // ic12's length field, at offset 8 + 4
    expect(() => slices(buf)).toThrow(/declares a bad length/);
  });

  it('rejects a slice whose declared length would run past the end of the file', () => {
    const buf = Buffer.from(load());
    buf.writeUInt32BE(buf.length + 100, 12); // ic12's length field
    expect(() => slices(buf)).toThrow(/declares a bad length/);
  });

  it('rejects trailing bytes left over after the last slice', () => {
    const buf = Buffer.from(load());
    // Shrink the final chunk ('info', at offset 144840) by 4 bytes without
    // touching the file's actual length or the header total, so the walk
    // stops 4 bytes short of buf.length with no chunk-length guard to catch
    // it -- exactly the gap the trailing-bytes check exists to close.
    buf.writeUInt32BE(318 - 4, 144840 + 4); // info's length field
    expect(() => slices(buf)).toThrow(/trailing bytes/);
  });
});

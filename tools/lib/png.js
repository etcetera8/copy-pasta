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

/**
 * @param {Buffer} buf  A complete PNG file.
 * @returns {{ w: number, h: number, depth: number, color: number, img: Buffer, stride: number }}
 *          `img` is raw RGBA, 4 bytes per pixel, `stride` bytes per row.
 */
function decode(buf) {
  let off = 8;
  let hdr = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      hdr = { w: buf.readUInt32BE(off + 8), h: buf.readUInt32BE(off + 12), depth: buf[off + 16], color: buf[off + 17] };
    }
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  if (!hdr) throw new Error('no IHDR');
  if (hdr.color !== 6 || hdr.depth !== 8) throw new Error(`expected 8-bit RGBA, got colour type ${hdr.color} depth ${hdr.depth}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = hdr.w * bpp;
  const img = Buffer.alloc(hdr.h * stride);
  // Undo the per-scanline filter each row carries in its leading byte.
  for (let y = 0; y < hdr.h; y++) {
    const filter = raw[y * (stride + 1)];
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
  return { ...hdr, img, stride };
}

module.exports = { decode };

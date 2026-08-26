#!/usr/bin/env node
/**
 * Guards the two properties of src/main/bowlTemplate.png and bowlTemplate@2x.png that break
 * quietly, and that the two of them broke in exactly these ways while being
 * written:
 *
 *   - Not blank. If the renderer fails to load the SVG (Chrome refuses a
 *     cross-origin file:// read, say) the screenshot still succeeds and still
 *     lands at the right dimensions. The only symptom is a menu bar with
 *     nothing in it.
 *   - Actually transparent, and pure black where it is not. macOS uses only
 *     the alpha channel of a template image; if Chrome composites onto opaque
 *     white first, every pixel is opaque and the menu bar gets a solid block.
 *
 * Run after tools/render-tray-icon.sh. Reads the PNGs directly rather than
 * shelling out, so it needs nothing that is not already installed.
 */
const fs = require('node:fs');
const zlib = require('node:zlib');
const path = require('node:path');

function decode(file) {
  const buf = fs.readFileSync(file);
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
  if (!hdr) throw new Error(`${file}: no IHDR`);
  if (hdr.color !== 6 || hdr.depth !== 8) throw new Error(`${file}: expected 8-bit RGBA, got colour type ${hdr.color} depth ${hdr.depth}`);

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

const root = path.join(__dirname, '..');
const targets = [
  { file: path.join(root, 'src/main/bowlTemplate.png'), size: 16 },
  { file: path.join(root, 'src/main/bowlTemplate@2x.png'), size: 32 },
];

let failed = false;
for (const { file, size } of targets) {
  const rel = path.relative(root, file);
  try {
    const { w, h, img } = decode(file);
    if (w !== size || h !== size) throw new Error(`expected ${size}x${size}, got ${w}x${h}`);

    let opaque = 0;
    let clear = 0;
    let tinted = 0;
    for (let i = 0; i < img.length; i += 4) {
      const [r, g, b, a] = [img[i], img[i + 1], img[i + 2], img[i + 3]];
      if (a === 0) clear++;
      else {
        opaque++;
        // Chrome premultiplies against the backdrop, so a pixel that is not
        // near-black here means it was composited onto something.
        if (r > 24 || g > 24 || b > 24) tinted++;
      }
    }
    const covered = opaque / (w * h);
    if (covered < 0.15) throw new Error(`only ${(covered * 100).toFixed(1)}% of pixels are drawn; the icon is blank or nearly so`);
    if (clear === 0) throw new Error('no fully transparent pixels; the icon was composited onto an opaque background');
    if (tinted > 0) throw new Error(`${tinted} drawn pixels are not black; a template image must be black plus alpha`);

    console.log(`ok  ${rel}  ${w}x${h}, ${(covered * 100).toFixed(1)}% drawn, ${clear} transparent`);
  } catch (err) {
    failed = true;
    console.error(`FAIL ${rel}: ${err.message}`);
  }
}
process.exit(failed ? 1 : 0);

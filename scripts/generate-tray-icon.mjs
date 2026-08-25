/**
 * Generates the macOS menu bar (tray) icon.
 *
 * Run: node scripts/generate-tray-icon.mjs
 *
 * Writes `src/main/bowlTemplate.png` (16px) and `src/main/bowlTemplate@2x.png`
 * (32px). The `Template` filename suffix is meaningful: Electron flags any
 * image loaded from such a path as a macOS template image, so the artwork here
 * is pure black plus an alpha mask and the OS recolors it -- white on a dark
 * menu bar, black on a light one, inverted while the menu is open.
 *
 * The geometry below is expressed on a 16-unit grid at half-unit precision, so
 * every edge lands on a whole pixel at BOTH 16px and 32px. That is what keeps
 * the icon sharp; the previous asset was a single 16px bitmap that macOS
 * upscaled 2x on Retina.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const GRID = 16;      // design space is 16x16 units
const SAMPLES = 8;    // 8x8 supersamples per output pixel

/** Signed-distance-ish coverage helpers, all in 16-unit design space. */
const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const ellipseHalf = (cx, cy, rx, ry, half) => (x, y) => {
  if (half === 'top' && y > cy) return false;
  if (half === 'bottom' && y < cy) return false;
  return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
};

/** Capsule: a line from (x1,y1) to (x2,y2) with radius r. */
const capsule = (x1, y1, x2, y2, r) => (x, y) => {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
  const px = x1 + t * dx, py = y1 + t * dy;
  return (x - px) ** 2 + (y - py) ** 2 <= r * r;
};

// --- The bowl -------------------------------------------------------------
// Same silhouette as the original: a nest of noodles above a wide rim and a
// tapering bowl. Cut shapes carve negative space back out -- without the gap
// between the nest and the rim the whole thing fuses into one blob at 16px.
const ADD = [
  // Noodle nest: a base mound plus three lumps. The lumps are deliberately
  // narrow so the union's top edge dips between them -- a wider middle lump
  // swallows the valleys and the nest flattens into a dome.
  ellipseHalf(8, 9.5, 6, 3.5, 'top'),
  disc(4, 6, 2),
  disc(8, 4.75, 1.75),
  disc(12, 6, 2),

  // Rim: a capsule whose vertical extent is exactly rows 10-12, so it renders
  // as solid, fully-opaque pixel rows rather than two grey half-covered ones.
  capsule(1.5, 11, 14.5, 11, 1),

  // Bowl beneath the rim.
  ellipseHalf(8, 12, 6.5, 4, 'bottom'),
];

const CUT = [
  // One clear pixel row (two at @2x) between the nest and the rim. Without it
  // nest, rim and bowl fuse into a single unreadable blob at 16px.
  capsule(1, 9.5, 15, 9.5, 0.5),
];

const covered = (x, y) => ADD.some((s) => s(x, y)) && !CUT.some((s) => s(x, y));

/** Renders the design to an {width x width} gray+alpha raw buffer. */
function render(width) {
  const scale = GRID / width;
  const step = scale / SAMPLES;
  const origin = step / 2;
  const raw = Buffer.alloc(width * width * 2);

  for (let py = 0; py < width; py++) {
    for (let px = 0; px < width; px++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = px * scale + origin + sx * step;
          const y = py * scale + origin + sy * step;
          if (covered(x, y)) hits++;
        }
      }
      const i = (py * width + px) * 2;
      raw[i] = 0; // black; macOS derives the rendered colour from alpha alone
      raw[i + 1] = Math.round((hits / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return raw;
}

/** Minimal PNG encoder: 8-bit greyscale+alpha, no filtering. */
function encodePng(raw, width) {
  const stride = width * 2;
  const scanlines = Buffer.alloc((stride + 1) * width);
  for (let y = 0; y < width; y++) {
    scanlines[y * (stride + 1)] = 0; // filter type: none
    raw.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeInt32BE(crc(out.slice(4, 8 + data.length)), 8 + data.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(width, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 4; // colour type: greyscale + alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) | 0;
}

const outDir = path.resolve(import.meta.dirname, '../src/main');
for (const [width, name] of [[16, 'bowlTemplate.png'], [32, 'bowlTemplate@2x.png']]) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, encodePng(render(width), width));
  console.log(`wrote ${name} (${width}x${width})`);
}

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
 * shelling out, so it needs nothing that is not already installed -- the
 * decoder in tools/lib/png.js is hand-rolled for that reason.
 */
const fs = require('node:fs');
const path = require('node:path');
const { decode } = require('./lib/png');

const root = path.join(__dirname, '..');
const targets = [
  { file: path.join(root, 'src/main/bowlTemplate.png'), size: 16 },
  { file: path.join(root, 'src/main/bowlTemplate@2x.png'), size: 32 },
];

let failed = false;
for (const { file, size } of targets) {
  const rel = path.relative(root, file);
  try {
    const { w, h, img } = decode(fs.readFileSync(file));
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

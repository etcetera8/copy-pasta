#!/usr/bin/env node
/**
 * Guards assets/appIcon.icns, and guards the fact that it reached the app.
 *
 * Two failures this catches, both of which produce a green build:
 *
 *   - The mark did not render. If Chrome fails to load the SVG (a
 *     cross-origin file:// read, say) it still paints the plate, so the
 *     screenshot is a clean dark rounded square at exactly the right size.
 *     That is worse than a blank icon: it looks deliberate, and it would ship.
 *     Hence the colour assertion below -- being non-blank is not enough,
 *     the mark's own blue and green have to be in there.
 *
 *   - The icon never reached the bundle. @electron/packager treats an icon
 *     path it cannot resolve as a warning, not an error (platform.js:159):
 *     it logs "skipping this app icon format" and packages the default.
 *     Worse, it never rewrites CFBundleIconFile -- mac.js:316 copies the
 *     configured icns *over* Contents/Resources/electron.icns -- so the
 *     packaged Info.plist reads `electron.icns` whether the icon was set or
 *     not. Nothing about the bundle's shape distinguishes the two cases.
 *     Comparing bytes is the only honest check, and that is what the arch
 *     mode below does.
 *
 * Usage:
 *
 *   node tools/check-app-icon.js          # check the committed icns
 *   node tools/check-app-icon.js arm64    # also check the packaged bundle
 */
const fs = require('node:fs');
const path = require('node:path');
const { decode } = require('./lib/png');

const ROOT = path.join(__dirname, '..');
const ICNS = path.join(ROOT, 'assets', 'appIcon.icns');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// From site/assets/bowl.svg. Kept in step by hand, like every other copy of
// these two values -- see the note in that file's header.
const MARK_COLOURS = [
  { name: 'blue', rgb: [0x56, 0x9c, 0xd6] },
  { name: 'green', rgb: [0xb5, 0xce, 0xa8] },
];
// Per channel. Wide enough to catch antialiased blends toward the plate,
// narrow enough that #1e1e1e cannot pass as either colour: the plate is 56
// away from the blue on the red channel alone.
const COLOUR_TOLERANCE = 40;
// The mark is only unambiguously resolvable from 128 up. At 16 it spans
// about eleven pixels and its green survives mostly as blends, so a colour
// floor there would fail on a correct icon.
const COLOUR_CHECKED_FROM = 128;
const REQUIRED_SIZES = [128, 256, 512, 1024];

/**
 * Split an icns container into its slices.
 *
 * The format is a four-byte 'icns' magic, a big-endian total length, then a
 * flat run of chunks: four-byte type, big-endian length *including* the
 * eight-byte chunk header, then the payload.
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
  return found;
}

/** Count drawn pixels, and pixels near each of the mark's colours. */
function survey(img) {
  let drawn = 0;
  const hits = new Map(MARK_COLOURS.map((c) => [c.name, 0]));
  for (let i = 0; i < img.length; i += 4) {
    // Fully transparent pixels are the margin outside the plate.
    if (img[i + 3] < 8) continue;
    drawn++;
    for (const c of MARK_COLOURS) {
      const near =
        Math.abs(img[i] - c.rgb[0]) <= COLOUR_TOLERANCE &&
        Math.abs(img[i + 1] - c.rgb[1]) <= COLOUR_TOLERANCE &&
        Math.abs(img[i + 2] - c.rgb[2]) <= COLOUR_TOLERANCE;
      if (near) hits.set(c.name, hits.get(c.name) + 1);
    }
  }
  return { drawn, hits };
}

const failures = [];

if (!fs.existsSync(ICNS)) {
  console.error(`no icon at ${path.relative(ROOT, ICNS)} -- run ./tools/render-app-icon.sh first`);
  process.exit(2);
}

const icns = fs.readFileSync(ICNS);
const checked = [];
const skipped = [];

try {
  for (const { type, data } of slices(icns)) {
    // Slice type codes are not hardcoded on purpose. iconutil picks between
    // icp4, is32/s8mk and friends for the small sizes and that choice is
    // Apple's to change; what matters is the picture inside. Anything that
    // is not a PNG is skipped, and REQUIRED_SIZES below is what stops that
    // leniency from hollowing the check out.
    //
    // On macOS 26 / iconutil as of 2026-08 this leaves ic04, ic05 (the
    // 16px and 32px legacy slices, stored as raw pixel data behind an
    // 'ARGB' magic rather than PNG-encoded) and the 'info' bookkeeping
    // chunk unchecked, and decodes the rest.
    if (!data.subarray(0, 8).equals(PNG_MAGIC)) {
      skipped.push(type);
      continue;
    }

    const before = failures.length;
    const { w, h, img } = decode(data);
    if (w !== h) failures.push(`slice '${type}' is ${w}x${h}, not square`);

    const total = w * h;
    const { drawn, hits } = survey(img);

    const covered = drawn / total;
    if (covered < 0.15) {
      failures.push(`slice '${type}' (${w}px) is ${(covered * 100).toFixed(1)}% drawn; it is blank or nearly so`);
    }

    if (w >= COLOUR_CHECKED_FROM) {
      for (const c of MARK_COLOURS) {
        const share = hits.get(c.name) / total;
        if (share < 0.005) {
          failures.push(
            `slice '${type}' (${w}px) has almost no ${c.name} (${(share * 100).toFixed(2)}%); ` +
              'the plate rendered but the mark did not',
          );
        }
      }
    }

    checked.push(w);
    // Only claim ok if this slice added no failures of its own.
    if (failures.length === before) {
      const colours = MARK_COLOURS.map((c) => `${c.name} ${((hits.get(c.name) / total) * 100).toFixed(1)}%`).join(', ');
      console.log(`ok  slice '${type}'  ${w}x${h}, ${(covered * 100).toFixed(1)}% drawn, ${colours}`);
    }
  }
} catch (err) {
  console.error(`FAIL ${path.relative(ROOT, ICNS)}: ${err.message}`);
  process.exit(1);
}

for (const size of REQUIRED_SIZES) {
  if (!checked.includes(size)) failures.push(`no decodable ${size}px slice in the icns`);
}
if (skipped.length > 0) console.log(`    (skipped non-PNG slices: ${skipped.join(', ')})`);

// Given an arch, also prove the icon reached the packaged bundle.
const arch = process.argv[2];
if (arch) {
  const packaged = path.join(
    ROOT, 'out', `Copy Pasta-darwin-${arch}`, 'Copy Pasta.app',
    'Contents', 'Resources', 'electron.icns',
  );
  if (!fs.existsSync(packaged)) {
    console.error(`no packaged app at ${packaged} -- run electron-forge make first`);
    process.exit(2);
  }
  // The default-icon case is a *different* file under the *same* name, so
  // only the bytes tell them apart.
  if (!fs.readFileSync(packaged).equals(icns)) {
    failures.push(
      `${packaged} is not assets/appIcon.icns -- packager fell back to Electron's default, ` +
        'most likely because packagerConfig.icon does not resolve',
    );
  } else {
    console.log(`ok  packaged bundle carries the icon (${arch})`);
  }
}

if (failures.length > 0) {
  console.error('app icon check failed:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('app icon looks right');

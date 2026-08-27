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
 *     Under Forge, even that warning never appears -- Forge's package step
 *     calls packager with `quiet: true` (@electron-forge/core's
 *     api/package.js:226), and packager's warning() only prints
 *     `if (!quiet)` (common.js:32), so the one diagnostic that would have
 *     said "your icon config is wrong" is unconditionally suppressed. And
 *     packager never rewrites CFBundleIconFile either way -- mac.js:316
 *     copies the configured icns *over* Contents/Resources/electron.icns --
 *     so the packaged Info.plist reads `electron.icns` whether the icon was
 *     set or not. Nothing about the bundle's shape, and nothing printed
 *     during the build, distinguishes the two cases. Comparing bytes is the
 *     only honest check, and that is what the arch mode below does.
 *
 * Usage:
 *
 *   node tools/check-app-icon.js          # check the committed icns
 *   node tools/check-app-icon.js arm64    # also check the packaged bundle
 */
const fs = require('node:fs');
const path = require('node:path');
const { decode } = require('./lib/png');
const { slices } = require('./lib/icns');

const ROOT = path.join(__dirname, '..');
const ICNS = path.join(ROOT, 'assets', 'appIcon.icns');
const PRODUCT_NAME = require(path.join(ROOT, 'package.json')).productName;

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

// A bad container is fatal on its own -- there is nothing left to survey --
// so it gets its own try/catch and exits immediately. Per-slice decode
// failures below are a different kind of problem: they are exactly the sort
// of per-item finding `failures` exists to collect, and one bad slice must
// not cost the report on every other slice, the REQUIRED_SIZES sweep, the
// skipped-slices line, or (when an arch was given) the packaged-bundle
// check that runs after this loop.
let parsed;
try {
  parsed = slices(icns);
} catch (err) {
  console.error(`FAIL ${path.relative(ROOT, ICNS)}: ${err.message}`);
  process.exit(1);
}

for (const { type, data } of parsed) {
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
  try {
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
      // Below COLOUR_CHECKED_FROM the colour floors above never ran, so a
      // 0.0% here is not evidence of anything -- but silently dropping the
      // numbers would recreate, one level up, exactly the trap this script
      // exists to defuse: a line that reads as fine while showing the
      // failure's own symptom. Keeping them and marking the gap is also
      // what keeps COLOUR_CHECKED_FROM honest -- the small-slice percentages
      // printed on a real icon are the evidence that threshold is set where
      // it should be.
      const scope = w >= COLOUR_CHECKED_FROM ? '' : ` (colour not asserted below ${COLOUR_CHECKED_FROM}px)`;
      console.log(`ok  slice '${type}'  ${w}x${h}, ${(covered * 100).toFixed(1)}% drawn, ${colours}${scope}`);
    }
  } catch (err) {
    // Same principle as above, one level down: one slice's decode error
    // must not blot out every other slice's already-computed findings, and
    // must keep the type that failed rather than blaming the whole file.
    failures.push(`slice '${type}' failed to decode: ${err.message}`);
  }
}

for (const size of REQUIRED_SIZES) {
  if (!checked.includes(size)) failures.push(`no decodable ${size}px slice in the icns`);
}
if (skipped.length > 0) console.log(`    (skipped non-PNG slices: ${skipped.join(', ')})`);

// Given an arch, also prove the icon reached the packaged bundle.
const arch = process.argv[2];
if (arch) {
  const packaged = path.join(
    ROOT, 'out', `${PRODUCT_NAME}-darwin-${arch}`, `${PRODUCT_NAME}.app`,
    'Contents', 'Resources', 'electron.icns',
  );
  const relPackaged = path.relative(ROOT, packaged);
  if (!fs.existsSync(packaged)) {
    console.error(`no packaged app at ${relPackaged} -- run electron-forge package --arch=${arch} first`);
    process.exit(2);
  }
  // The default-icon case is a *different* file under the *same* name, so
  // only the bytes tell them apart.
  if (!fs.readFileSync(packaged).equals(icns)) {
    failures.push(
      `${relPackaged} is not assets/appIcon.icns -- packager fell back to Electron's default, ` +
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

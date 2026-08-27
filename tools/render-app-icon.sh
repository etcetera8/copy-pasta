#!/usr/bin/env bash
# Builds assets/appIcon.icns, the icon Finder shows for the packaged app.
#
# Unlike the menu-bar icon, this composites rather than draws: the mark comes
# straight from site/assets/bowl.svg and this script adds the plate behind it.
# Copying that SVG into a second file would recreate exactly the drift its own
# header says it exists to prevent, so the plate lives here as geometry
# instead, and the numbers below are the whole of that decision.
#
# Geometry, from Apple's macOS 11+ icon grid:
#
#   - The plate is 824/1024 of the canvas, centred. The remaining margin is
#     transparent. This is not pedantry -- a full-bleed icon reads as roughly
#     20% larger than every neighbour in the Applications folder.
#   - Its corner radius is 22.5% of the plate.
#   - MARK_INSET is how much of the plate the mark spans. It was tuned by
#     looking at the rendered 128 and 512 slices; bowl.svg's drawing is not
#     centred in its own viewBox (it spans about 73% horizontally but 92%
#     vertically), so this is an eyeballed number and not a derived one.
#
# #1e1e1e is $black from src/shared/styles/_tokens.scss, written out as hex
# because Sass cannot reach into a Chrome render driven from a shell script.
# Same standing exception, and same manual upkeep, as the colours inside
# bowl.svg itself.
#
# Headless Chrome is the rasteriser for the same reasons as the tray icon:
# it is the one always present on a machine that can run this app, and it is
# the engine the landing page draws the same mark with. Two things it needs
# are load-bearing and easy to undo by accident:
#
#   - The SVG is inlined into the page rather than referenced with <img src>.
#     Chrome gives every file:// document its own opaque origin, so a page in
#     the temp dir may not read an SVG out of the repo; it renders a broken
#     image and the screenshot comes out as a bare plate. That failure is
#     silent, and worse than the tray icon's equivalent: a plateless glyph
#     looks broken, but a plain dark rounded square looks deliberate.
#   - --default-background-color takes 8-digit ARGB. Without it Chrome
#     composites onto opaque white and the transparent margin around the
#     plate becomes a white square.
#
# Verify with: node tools/check-app-icon.js
set -euo pipefail

cd "$(dirname "$0")/.."

MARK_INSET=0.86

chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$chrome" ] || { echo "Google Chrome not found at $chrome" >&2; exit 1; }
command -v iconutil >/dev/null 2>&1 || { echo "iconutil not found (macOS only)" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
iconset="$work/appIcon.iconset"
mkdir -p "$iconset"

render() { # size, outfile
  local size="$1" out="$2" geom
  # plate edge, corner radius, mark edge -- all in device pixels at this size.
  geom=($(node -e "
    const s = $size;
    const plate = Math.round(s * 824 / 1024);
    process.stdout.write([
      plate,
      (plate * 0.225).toFixed(3),
      Math.round(plate * $MARK_INSET),
    ].join(' '));
  "))

  {
    printf '<!DOCTYPE html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}.canvas{width:%spx;height:%spx;display:flex;align-items:center;justify-content:center}.plate{width:%spx;height:%spx;background:#1e1e1e;border-radius:%spx;display:flex;align-items:center;justify-content:center;overflow:hidden}svg{display:block;width:%spx;height:%spx}</style><div class="canvas"><div class="plate">' \
      "$size" "$size" "${geom[0]}" "${geom[0]}" "${geom[1]}" "${geom[2]}" "${geom[2]}"
    cat site/assets/bowl.svg
    printf '</div></div>'
  } > "$work/icon.html"

  "$chrome" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 \
    --default-background-color=00000000 \
    --screenshot="$out" \
    --window-size="$size,$size" \
    "file://$work/icon.html" >/dev/null 2>&1
  echo "  rendered ${size}x${size}"
}

# iconutil wants ten filenames, but they cover only seven distinct pixel
# sizes: each @2x file is the same raster as the plain file one step up.
# Rendering seven and copying three is both faster and guarantees the pairs
# are identical rather than merely equal.
render 16   "$iconset/icon_16x16.png"
render 32   "$iconset/icon_16x16@2x.png"
cp          "$iconset/icon_16x16@2x.png" "$iconset/icon_32x32.png"
render 64   "$iconset/icon_32x32@2x.png"
render 128  "$iconset/icon_128x128.png"
render 256  "$iconset/icon_128x128@2x.png"
cp          "$iconset/icon_128x128@2x.png" "$iconset/icon_256x256.png"
render 512  "$iconset/icon_256x256@2x.png"
cp          "$iconset/icon_256x256@2x.png" "$iconset/icon_512x512.png"
render 1024 "$iconset/icon_512x512@2x.png"

mkdir -p assets
iconutil -c icns "$iconset" -o assets/appIcon.icns
echo "wrote assets/appIcon.icns"

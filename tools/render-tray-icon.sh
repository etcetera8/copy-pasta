#!/usr/bin/env bash
# Rasterises src/main/bowlTemplate.svg into the two PNGs Electron's Tray
# loads: bowlTemplate.png (16x16) and bowlTemplate@2x.png (32x32, picked up automatically on
# retina by the @2x suffix -- it is a naming convention, not a config entry).
#
# Headless Chrome is the renderer because it is the one SVG rasteriser that is
# always present on a machine that can run this app, and because it is the
# same engine the landing page draws the mark with.
#
# Two things here are load-bearing and easy to undo by accident:
#
#   - The SVG is inlined into the page rather than referenced with <img src>.
#     Chrome gives every file:// document its own opaque origin, so a page in
#     the temp dir may not read an SVG out of the repo; it renders a broken
#     image and the screenshot comes out completely empty. That failure is
#     silent -- the PNGs are written at the right size, just blank.
#   - --default-background-color takes 8-digit ARGB. Without it Chrome
#     composites onto opaque white, macOS treats the whole square as opaque,
#     and the menu bar shows a solid block instead of the mark.
#
# Verify with: node tools/check-tray-icon.js
set -euo pipefail

cd "$(dirname "$0")/.."
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
[ -x "$chrome" ] || { echo "Google Chrome not found at $chrome" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

render() { # size, outfile
  { printf '<!DOCTYPE html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:%spx;height:%spx}</style>' "$1" "$1"
    cat src/main/bowlTemplate.svg
  } > "$work/icon.html"

  "$chrome" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 \
    --default-background-color=00000000 \
    --screenshot="$work/out.png" \
    --window-size="$1,$1" \
    "file://$work/icon.html" >/dev/null 2>&1
  cp "$work/out.png" "$2"
  echo "wrote $2"
}

render 16 src/main/bowlTemplate.png
render 32 src/main/bowlTemplate@2x.png

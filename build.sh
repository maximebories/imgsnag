#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST="$ROOT/dist"

rm -rf "$DIST"

for target in chrome firefox; do
  OUT="$DIST/$target"
  mkdir -p "$OUT"

  # Shared files
  cp -r "$ROOT/_locales" "$OUT/"
  mkdir -p "$OUT/icons"
  for size in 16 24 32 48 64 128; do
    [ -f "$ROOT/icons/${size}.png" ] && cp "$ROOT/icons/${size}.png" "$OUT/icons/"
  done
  cp -r "$ROOT/src/lib" "$OUT/"
  cp "$ROOT/src/background.js" "$OUT/"
  cp "$ROOT/src/content.js" "$OUT/"
  cp "$ROOT/src/options.js" "$OUT/"
  cp "$ROOT/src/options.html" "$OUT/"
  cp "$ROOT/src/popup.js" "$OUT/"
  cp "$ROOT/src/popup.html" "$OUT/"

  # Browser-specific manifest
  cp "$ROOT/manifest.${target}.json" "$OUT/manifest.json"

  # Package as zip
  (cd "$OUT" && zip -r "$DIST/imgsnag-${target}.zip" . -x '*.DS_Store')

  echo "Built: dist/imgsnag-${target}.zip"
done

echo "Done."

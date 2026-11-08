#!/usr/bin/env bash
# Build a release zip with only the files the extension actually needs.
# Excludes research notes, CSV/YAML, TESTING.md, check-rules.js, dist artefacts.
#
# Usage:  ./package.sh
# Output: dist/aoc-blocker-v<version>.zip   (Chrome/Edge sideload)
#         dist/aoc-blocker-v<version>.xpi   (Firefox AMO submission, same contents)

set -euo pipefail

cd "$(dirname "$0")"

node check-rules.js

VERSION=$(node -e 'console.log(require("./manifest.json").version)')
NAME="aoc-blocker-v${VERSION}"
OUT_DIR="dist"
STAGE="${OUT_DIR}/${NAME}"

rm -rf "${OUT_DIR}"
mkdir -p "${STAGE}"

# Files to include.
for f in manifest.json rules.js greeting-replacer.js content.js popup.html popup.js LICENSE README.md; do
  [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
  cp "$f" "${STAGE}/"
done

# Only the icon sizes manifest.json uses; the SVG and larger PNGs stay as
# source art for store listings.
mkdir -p "${STAGE}/icons"
for size in 16 32 48 96 128; do
  cp "icons/aoc-blocker-${size}.png" "${STAGE}/icons/"
done

ZIP="${OUT_DIR}/${NAME}.zip"
XPI="${OUT_DIR}/${NAME}.xpi"

# zip from inside the staging dir so the archive root contains the files
# directly (no leading "aoc-blocker-vX.Y.Z/" prefix). Chrome/Firefox both
# require the manifest at the root of the package.
( cd "${STAGE}" && zip -qr "../../${ZIP}" . )
cp "${ZIP}" "${XPI}"

# Remove staging dir, keep only the artefacts.
rm -rf "${STAGE}"

echo "built ${ZIP}"
echo "built ${XPI}"
ls -la "${OUT_DIR}/"

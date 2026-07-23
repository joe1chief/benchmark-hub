#!/usr/bin/env bash

set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP must point to the GitHub Actions temporary directory}"
: "${DRAWIO_DESKTOP_CLI:?DRAWIO_DESKTOP_CLI must point to the Draw.io executable}"
: "${IMAGEMAGICK_COMPARE:?IMAGEMAGICK_COMPARE must point to ImageMagick compare}"
: "${IMAGEMAGICK_COMPARE_REAL:?IMAGEMAGICK_COMPARE_REAL must point to ImageMagick compare}"
: "${IMAGEMAGICK_IDENTIFY:?IMAGEMAGICK_IDENTIFY must point to ImageMagick identify}"

source_base="client/public/drawio/LAB-Bench/LAB-Bench.en"
generated_png="${RUNNER_TEMP}/LAB-Bench.en.generated.png"

"${DRAWIO_DESKTOP_CLI}" \
  -x \
  -f png \
  --scale 1 \
  -o "${generated_png}" \
  "${source_base}.drawio"

printf 'Draw.io PNG diagnostic\n'
"${IMAGEMAGICK_IDENTIFY}" \
  -format 'generated: %wx%h %[colorspace] %[type]\n' \
  "${generated_png}"
"${IMAGEMAGICK_IDENTIFY}" \
  -format 'checked-in: %wx%h %[colorspace] %[type]\n' \
  "${source_base}.png"

for metric in AE RMSE SSIM; do
  metric_output="$(
    "${IMAGEMAGICK_COMPARE_REAL}" \
      -metric "${metric}" \
      "${generated_png}" \
      "${source_base}.png" \
      null: 2>&1
  )" || true
  printf '%s: %s\n' "${metric}" "${metric_output}"
done

"${IMAGEMAGICK_COMPARE}" \
  -metric AE \
  "${generated_png}" \
  "${source_base}.png" \
  null:

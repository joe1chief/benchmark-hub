#!/usr/bin/env bash

set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP must point to the GitHub Actions temporary directory}"
: "${DRAWIO_DESKTOP_CLI:?DRAWIO_DESKTOP_CLI must point to the Draw.io executable}"
: "${IMAGEMAGICK_COMPARE:?IMAGEMAGICK_COMPARE must point to ImageMagick compare}"

source_base="client/public/drawio/LAB-Bench/LAB-Bench.en"
generated_png="${RUNNER_TEMP}/LAB-Bench.en.generated.png"
identify_cli="$(dirname "${IMAGEMAGICK_COMPARE}")/identify"

"${DRAWIO_DESKTOP_CLI}" \
  -x \
  -f png \
  --scale 1 \
  -o "${generated_png}" \
  "${source_base}.drawio"

printf 'Draw.io PNG diagnostic\n'
"${identify_cli}" \
  -format 'generated: %wx%h %[colorspace] %[type]\n' \
  "${generated_png}"
"${identify_cli}" \
  -format 'checked-in: %wx%h %[colorspace] %[type]\n' \
  "${source_base}.png"

status=0
for metric in AE RMSE SSIM; do
  metric_output="$(
    "${IMAGEMAGICK_COMPARE}" \
      -metric "${metric}" \
      "${generated_png}" \
      "${source_base}.png" \
      null: 2>&1
  )" || status=$?
  printf '%s: %s\n' "${metric}" "${metric_output}"
done

exit "${status}"

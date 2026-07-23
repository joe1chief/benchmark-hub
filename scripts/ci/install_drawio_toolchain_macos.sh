#!/usr/bin/env bash

set -euo pipefail

DRAWIO_SKILL_REPOSITORY=https://github.com/bahayonghang/drawio-skills.git
DRAWIO_SKILL_COMMIT=15fbbc71ea13696d7c4e9d2fe7e668919e8608ea
DRAWIO_DESKTOP_VERSION=30.0.2
DRAWIO_DESKTOP_SHA256=cabbb29b250468d906c2cdd3a3920d96783d3af70871f17b8eed0cd3fa8d2cbf

: "${RUNNER_TEMP:?RUNNER_TEMP must point to the GitHub Actions temporary directory}"
: "${GITHUB_ENV:?GITHUB_ENV must be available in GitHub Actions}"
: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE must point to the repository checkout}"

skill_checkout="${RUNNER_TEMP}/drawio-skills"
desktop_package="${RUNNER_TEMP}/draw.io-arm64-${DRAWIO_DESKTOP_VERSION}.dmg"
desktop_url="https://github.com/jgraph/drawio-desktop/releases/download/v${DRAWIO_DESKTOP_VERSION}/draw.io-arm64-${DRAWIO_DESKTOP_VERSION}.dmg"
mount_point="${RUNNER_TEMP}/drawio-mount"
installed_app="${RUNNER_TEMP}/draw.io.app"

HOMEBREW_NO_AUTO_UPDATE=1 brew install imagemagick
image_compare_real="$(command -v compare)"
image_identify="$(command -v identify)"
image_compare="${GITHUB_WORKSPACE}/scripts/ci/compare_png_fidelity.py"
image_magick_font="/System/Library/Fonts/SFNS.ttf"
test -x "${image_compare_real}"
test -x "${image_identify}"
test -x "${image_compare}"
test -f "${image_magick_font}"

git clone \
  --filter=blob:none \
  --no-checkout \
  "${DRAWIO_SKILL_REPOSITORY}" \
  "${skill_checkout}"
git -C "${skill_checkout}" fetch --depth 1 origin "${DRAWIO_SKILL_COMMIT}"
git -C "${skill_checkout}" checkout --detach FETCH_HEAD
npm ci --prefix "${skill_checkout}"

curl \
  --fail \
  --location \
  --retry 3 \
  --output "${desktop_package}" \
  "${desktop_url}"
printf '%s  %s\n' "${DRAWIO_DESKTOP_SHA256}" "${desktop_package}" \
  | shasum --algorithm 256 --check

mkdir -p "${mount_point}"
hdiutil attach "${desktop_package}" \
  -mountpoint "${mount_point}" \
  -nobrowse \
  -readonly
trap 'hdiutil detach "${mount_point}" >/dev/null 2>&1 || true' EXIT

ditto "${mount_point}/draw.io.app" "${installed_app}"
desktop_cli="${installed_app}/Contents/MacOS/draw.io"
test -x "${desktop_cli}"

{
  printf 'IMPORTER_DRAWIO_E2E_CLI=%s\n' \
    "${skill_checkout}/skills/drawio/scripts/cli.js"
  printf 'DRAWIO_DESKTOP_CLI=%s\n' "${desktop_cli}"
  printf 'IMAGEMAGICK_COMPARE=%s\n' "${image_compare}"
  printf 'IMAGEMAGICK_COMPARE_REAL=%s\n' "${image_compare_real}"
  printf 'IMAGEMAGICK_IDENTIFY=%s\n' "${image_identify}"
  printf 'IMAGEMAGICK_FONT=%s\n' "${image_magick_font}"
} >> "${GITHUB_ENV}"

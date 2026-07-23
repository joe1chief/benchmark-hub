#!/usr/bin/env bash

set -euo pipefail

DRAWIO_SKILL_REPOSITORY=https://github.com/bahayonghang/drawio-skills.git
DRAWIO_SKILL_COMMIT=15fbbc71ea13696d7c4e9d2fe7e668919e8608ea
DRAWIO_DESKTOP_VERSION=30.0.2
DRAWIO_DESKTOP_SHA256=cb44a6770c7dcaef9adbf370beb365b740bde8c4c6e2de9d7a56824cd9ea49af

: "${RUNNER_TEMP:?RUNNER_TEMP must point to the GitHub Actions temporary directory}"
: "${GITHUB_ENV:?GITHUB_ENV must be available in GitHub Actions}"
: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE must point to the checked-out repository}"

skill_checkout="${RUNNER_TEMP}/drawio-skills"
desktop_package="${RUNNER_TEMP}/drawio-amd64-${DRAWIO_DESKTOP_VERSION}.deb"
desktop_url="https://github.com/jgraph/drawio-desktop/releases/download/v${DRAWIO_DESKTOP_VERSION}/drawio-amd64-${DRAWIO_DESKTOP_VERSION}.deb"

git clone \
  --filter=blob:none \
  --no-checkout \
  "${DRAWIO_SKILL_REPOSITORY}" \
  "${skill_checkout}"
git -C "${skill_checkout}" fetch --depth 1 origin "${DRAWIO_SKILL_COMMIT}"
git -C "${skill_checkout}" checkout --detach FETCH_HEAD
npm ci --prefix "${skill_checkout}/skills/drawio/scripts"

curl \
  --fail \
  --location \
  --retry 3 \
  --output "${desktop_package}" \
  "${desktop_url}"
printf '%s  %s\n' "${DRAWIO_DESKTOP_SHA256}" "${desktop_package}" | sha256sum --check -

sudo apt-get update
sudo apt-get install --yes "${desktop_package}" xvfb

{
  printf 'IMPORTER_DRAWIO_E2E_CLI=%s\n' \
    "${skill_checkout}/skills/drawio/scripts/cli.js"
  printf 'DRAWIO_DESKTOP_CLI=%s\n' \
    "${GITHUB_WORKSPACE}/scripts/ci/drawio-desktop-ci.sh"
} >> "${GITHUB_ENV}"

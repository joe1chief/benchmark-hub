#!/usr/bin/env bash

set -euo pipefail

exec xvfb-run --auto-servernum /usr/bin/drawio "$@"

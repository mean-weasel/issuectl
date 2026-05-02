#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -z "${IOS_DESTINATION:-}" ]; then
  if [ -z "${IOS_DEVICE_ID:-}" ]; then
    echo "Set IOS_DEVICE_ID=<device-udid> or IOS_DESTINATION='platform=iOS,id=<device-udid>'." >&2
    exit 64
  fi
  export IOS_DESTINATION="platform=iOS,id=${IOS_DEVICE_ID}"
fi

export IOS_SCHEME="${IOS_SCHEME:-IssueCTLPreview-UISmoke}"
export IOS_CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
export IOS_UI_SMOKE_PROFILE="${IOS_UI_SMOKE_PROFILE:-fast}"

exec ./scripts/ios-ui-smoke.sh

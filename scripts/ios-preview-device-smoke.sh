#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

device_id="${IOS_DEVICE_ID:-}"

if [ -z "${IOS_DESTINATION:-}" ]; then
  if [ -z "$device_id" ]; then
    echo "Set IOS_DEVICE_ID=<device-udid> or IOS_DESTINATION='platform=iOS,id=<device-udid>'." >&2
    echo "Run 'pnpm ios:list-devices' to find the CoreDevice identifier." >&2
    exit 64
  fi
  export IOS_DESTINATION="platform=iOS,id=${device_id}"
else
  device_id="$(printf '%s\n' "$IOS_DESTINATION" | sed -n 's/.*id=\([^,]*\).*/\1/p')"
fi

export IOS_SCHEME="${IOS_SCHEME:-IssueCTLPreview-UISmoke}"
export IOS_CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
export IOS_UI_SMOKE_PROFILE="${IOS_UI_SMOKE_PROFILE:-fast}"
export IOS_DEVICE_READY_TIMEOUT="${IOS_DEVICE_READY_TIMEOUT:-45}"

case "$IOS_UI_SMOKE_PROFILE" in
  fast)
    export IOS_UI_SMOKE_TIMEOUT="${IOS_UI_SMOKE_TIMEOUT:-420}"
    ;;
  pr)
    export IOS_UI_SMOKE_TIMEOUT="${IOS_UI_SMOKE_TIMEOUT:-600}"
    ;;
  full)
    export IOS_UI_SMOKE_TIMEOUT="${IOS_UI_SMOKE_TIMEOUT:-900}"
    ;;
  *)
    # Let ios-ui-smoke.sh report the unsupported profile with the canonical error.
    export IOS_UI_SMOKE_TIMEOUT="${IOS_UI_SMOKE_TIMEOUT:-600}"
    ;;
esac

if [ -z "$device_id" ]; then
  echo "IOS_DESTINATION must include an id=... device identifier for physical preview smoke tests." >&2
  exit 64
fi

echo "Checking physical iOS device readiness for: $device_id"
echo "Keep the iPhone unlocked and awake until the UI test starts."

ready_deadline=$((SECONDS + IOS_DEVICE_READY_TIMEOUT))
while true; do
  if xcrun devicectl list devices 2>/dev/null | grep -F "$device_id" | grep -q "connected"; then
    if xcrun devicectl device info details --device "$device_id" --quiet --timeout 10 >/dev/null 2>&1; then
      break
    fi
  fi

  if [ "$SECONDS" -ge "$ready_deadline" ]; then
    cat >&2 <<EOF
Device '$device_id' was not ready within ${IOS_DEVICE_READY_TIMEOUT}s.

Make sure the iPhone is:
- connected to this Mac
- trusted by this Mac
- unlocked and awake

Run 'pnpm ios:list-devices' to verify the CoreDevice identifier, then retry.
EOF
    exit 69
  fi

  sleep 3
done

exec ./scripts/ios-ui-smoke.sh

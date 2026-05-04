#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

device_name="${IOS_DEVICE_NAME:-iPhone-preview}"
device_id="${IOS_DEVICE_ID:-}"

if [ -z "${IOS_DESTINATION:-}" ]; then
  if [ -z "$device_id" ]; then
    echo "Resolving physical preview device by name: $device_name"
    resolver_output="$(./scripts/ios-resolve-preview-device.sh shell)"
    eval "$resolver_output"
    device_id="$IOS_DEVICE_ID"
    export IOS_DEVICE_ID
    export IOS_XCODE_DEVICE_ID
    export IOS_DESTINATION
  else
    if [ -z "${IOS_XCODE_DEVICE_ID:-}" ]; then
      provided_device_id="$device_id"
      resolver_output="$(./scripts/ios-resolve-preview-device.sh shell)"
      eval "$resolver_output"
      device_id="$provided_device_id"
    fi
    export IOS_DEVICE_ID="$device_id"
    export IOS_DESTINATION="platform=iOS,id=${IOS_XCODE_DEVICE_ID:-$device_id}"
  fi
else
  destination_id="$(printf '%s\n' "$IOS_DESTINATION" | sed -n 's/.*id=\([^,]*\).*/\1/p')"
  if [ -z "$device_id" ]; then
    device_id="$destination_id"
  fi
fi

export IOS_SCHEME="${IOS_SCHEME:-IssueCTLPreview-UISmoke}"
export IOS_CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
export IOS_UI_SMOKE_PROFILE="${IOS_UI_SMOKE_PROFILE:-fast}"
export IOS_DEVICE_READY_TIMEOUT="${IOS_DEVICE_READY_TIMEOUT:-45}"
export IOS_XCODEBUILD_EXTRA_ARGS="${IOS_XCODEBUILD_EXTRA_ARGS:--allowProvisioningUpdates -allowProvisioningDeviceRegistration}"

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
echo "Device role: $device_name"
echo "Xcode destination: $IOS_DESTINATION"
echo "Keep the iPhone unlocked and awake until the UI test starts."

ready_deadline=$((SECONDS + IOS_DEVICE_READY_TIMEOUT))
while true; do
  if xcrun devicectl device info details --device "$device_id" --quiet --timeout 10 >/dev/null 2>&1; then
    break
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

lock_json="$(mktemp "${TMPDIR:-/tmp}/issuectl-device-lock.XXXXXX")"
trap 'rm -f "$lock_json"' EXIT
if xcrun devicectl device info lockState --device "$device_id" --json-output "$lock_json" --quiet --timeout 10 >/dev/null 2>&1; then
  echo "Device lock state:"
  jq -r '.result | "  passcodeRequired=\(.passcodeRequired) unlockedSinceBoot=\(.unlockedSinceBoot)"' "$lock_json"
else
  echo "Could not read device lock state; continuing to xcodebuild, which will fail if the phone is locked." >&2
fi

exec ./scripts/ios-ui-smoke.sh

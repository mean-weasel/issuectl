#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="${IOS_PROJECT:-ios/IssueCTL.xcodeproj}"
SCHEME="${IOS_SCHEME:-IssueCTLPreview-UISmoke}"
DEVICE_NAME="${IOS_DEVICE_NAME:-iPhone-preview}"
MODE="${1:-human}"

json_file="$(mktemp "${TMPDIR:-/tmp}/issuectl-devices.XXXXXX")"
trap 'rm -f "$json_file"' EXIT

xcrun devicectl list devices --json-output "$json_file" >/dev/null

coredevice_id="$(
  jq -r --arg name "$DEVICE_NAME" '
    .result.devices[]
    | select(.deviceProperties.name == $name)
    | .identifier
  ' "$json_file" | head -n 1
)"

if [ -z "$coredevice_id" ]; then
  echo "Could not find CoreDevice device named '$DEVICE_NAME'." >&2
  echo "Available devices:" >&2
  jq -r '.result.devices[] | "  \(.deviceProperties.name // "unknown") \(.identifier) \(.hardwareProperties.marketingName // "")"' "$json_file" >&2
  exit 69
fi

xcode_device_id="$(
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -showdestinations 2>/dev/null \
    | awk -v name="$DEVICE_NAME" '
        $0 ~ /platform:iOS,/ && $0 ~ "name:" name {
          print
          exit
        }
      ' \
    | sed -n 's/.*id:\([^,}]*\).*/\1/p'
)"

if [ -z "$xcode_device_id" ]; then
  echo "Could not find Xcode iOS destination named '$DEVICE_NAME' for scheme '$SCHEME'." >&2
  echo "Available destinations:" >&2
  xcodebuild -project "$PROJECT" -scheme "$SCHEME" -showdestinations >&2
  exit 70
fi

case "$MODE" in
  shell)
    printf 'IOS_DEVICE_NAME=%q\n' "$DEVICE_NAME"
    printf 'IOS_DEVICE_ID=%q\n' "$coredevice_id"
    printf 'IOS_XCODE_DEVICE_ID=%q\n' "$xcode_device_id"
    printf 'IOS_DESTINATION=%q\n' "platform=iOS,id=$xcode_device_id"
    ;;
  human)
    printf 'Device name: %s\n' "$DEVICE_NAME"
    printf 'CoreDevice id: %s\n' "$coredevice_id"
    printf 'Xcode destination id: %s\n' "$xcode_device_id"
    printf 'Xcode destination: platform=iOS,id=%s\n' "$xcode_device_id"
    ;;
  *)
    echo "Usage: $0 [human|shell]" >&2
    exit 64
    ;;
esac

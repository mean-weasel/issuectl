#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="${IOS_PROJECT:-ios/IssueCTL.xcodeproj}"
SCHEME="${IOS_SCHEME:-IssueCTLPreview}"
CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
DEVICE_NAME="${IOS_DEVICE_NAME:-iPhone-preview}"
DERIVED_DATA_PATH="${IOS_DERIVED_DATA_PATH:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/issuectl-preview-install-derived-data}"

if [ "$DEVICE_NAME" != "iPhone-preview" ]; then
  echo "Refusing to install preview app on unexpected device '$DEVICE_NAME'." >&2
  exit 64
fi

if [ -z "${IOS_DESTINATION:-}" ] || [ -z "${IOS_DEVICE_ID:-}" ]; then
  resolver_output="$(IOS_PROJECT="$PROJECT" IOS_SCHEME="$SCHEME" IOS_DEVICE_NAME="$DEVICE_NAME" ./scripts/ios-resolve-preview-device.sh shell)"
  eval "$resolver_output"
  export IOS_DEVICE_ID IOS_XCODE_DEVICE_ID IOS_DESTINATION
fi

if [ -z "${IOS_DEVICE_ID:-}" ] || [ -z "${IOS_DESTINATION:-}" ]; then
  echo "Could not resolve $DEVICE_NAME for preview install." >&2
  exit 69
fi

rm -rf "$DERIVED_DATA_PATH"
mkdir -p "$DERIVED_DATA_PATH"

args=()
if [ -n "${IOS_XCODEBUILD_EXTRA_ARGS:-}" ]; then
  # shellcheck disable=SC2206
  XCODEBUILD_EXTRA_ARGS=($IOS_XCODEBUILD_EXTRA_ARGS)
  args+=("${XCODEBUILD_EXTRA_ARGS[@]}")
fi

args+=(
  build
  -project "$PROJECT"
  -scheme "$SCHEME"
  -destination "$IOS_DESTINATION"
  -configuration "$CONFIGURATION"
  -derivedDataPath "$DERIVED_DATA_PATH"
)

echo "Building $SCHEME ($CONFIGURATION) for $DEVICE_NAME."
echo "Xcode destination: $IOS_DESTINATION"
if command -v xcpretty >/dev/null 2>&1; then
  set -o pipefail
  xcodebuild "${args[@]}" | xcpretty
else
  xcodebuild "${args[@]}"
fi

app_path="$DERIVED_DATA_PATH/Build/Products/${CONFIGURATION}-iphoneos/IssueCTLPreview.app"

if [ ! -d "$app_path" ]; then
  echo "Could not find built IssueCTLPreview.app under $DERIVED_DATA_PATH/Build/Products." >&2
  exit 70
fi

bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Info.plist")"
if [ "$bundle_id" != "com.issuectl.ios.preview" ]; then
  echo "Refusing to install unexpected bundle id '$bundle_id' from $app_path." >&2
  exit 70
fi

echo "Installing $bundle_id on $DEVICE_NAME."
xcrun devicectl device install app \
  --device "$IOS_DEVICE_ID" \
  "$app_path"

echo "Installed $bundle_id from $app_path."

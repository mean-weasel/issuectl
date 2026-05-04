#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

device_name="${IOS_DEVICE_NAME:-iPhone-preview}"
scheme="${IOS_SCHEME:-IssueCTLPreview-UISmoke}"
project="${IOS_PROJECT:-ios/IssueCTL.xcodeproj}"
keychain="${IOS_PREVIEW_KEYCHAIN_PATH:-$HOME/Library/Keychains/login.keychain-db}"
identity_pattern="${IOS_PREVIEW_SIGNING_IDENTITY_PATTERN:-Apple Development:}"

echo "iOS preview runner preflight"
echo "User: $(id -un)"
echo "Home: $HOME"
echo "Runner service: ${ACTIONS_RUNNER_SVC:-0}"
echo "Project: $project"
echo "Scheme: $scheme"
echo "Device role: $device_name"
echo "Keychain: $keychain"

if [ ! -f "$keychain" ]; then
  echo "Expected keychain does not exist: $keychain" >&2
  exit 66
fi

if [ -n "${IOS_PREVIEW_KEYCHAIN_PASSWORD:-}" ]; then
  echo "Unlocking preview signing keychain."
  security unlock-keychain -p "$IOS_PREVIEW_KEYCHAIN_PASSWORD" "$keychain"
  security set-keychain-settings -lut "${IOS_PREVIEW_KEYCHAIN_TIMEOUT:-21600}" "$keychain"

  current_keychains="$(security list-keychains -d user | tr -d '"')"
  if ! printf '%s\n' "$current_keychains" | grep -Fxq "$keychain"; then
    # Keep existing user keychains while making the signing keychain visible to launchd jobs.
    # shellcheck disable=SC2086
    security list-keychains -d user -s "$keychain" $current_keychains
  fi

  security default-keychain -d user -s "$keychain"

  if [ "${IOS_PREVIEW_SET_KEY_PARTITION_LIST:-0}" = "1" ]; then
    echo "Refreshing key partition list for non-interactive codesign access."
    security set-key-partition-list \
      -S apple-tool:,apple:,codesign: \
      -s \
      -k "$IOS_PREVIEW_KEYCHAIN_PASSWORD" \
      "$keychain" >/dev/null
  fi
else
  echo "IOS_PREVIEW_KEYCHAIN_PASSWORD is not set; assuming the keychain is already unlocked."
fi

echo "Default keychain:"
security default-keychain -d user

echo "Visible signing identities:"
identities="$(security find-identity -v -p codesigning "$keychain" || true)"
printf '%s\n' "$identities"
if ! printf '%s\n' "$identities" | grep -q "$identity_pattern"; then
  cat >&2 <<EOF
No codesigning identity matching '$identity_pattern' was visible in $keychain.

For the self-hosted runner service, set the GitHub secret IOS_PREVIEW_KEYCHAIN_PASSWORD
to the login or dedicated preview keychain password, then retry.
EOF
  exit 65
fi

if command -v automationmodetool >/dev/null 2>&1; then
  automation_status="$(automationmodetool help 2>&1 || true)"
  printf '%s\n' "$automation_status"
  if ! printf '%s\n' "$automation_status" | grep -q 'DOES NOT REQUIRE user authentication'; then
    cat >&2 <<EOF
Automation Mode still requires local user authentication.

Run this once from an interactive admin session on the runner Mac:
  automationmodetool enable-automationmode-without-authentication
EOF
    exit 69
  fi
else
  echo "automationmodetool is unavailable; continuing."
fi

echo "Resolving preview device."
resolver_output="$(IOS_DEVICE_NAME="$device_name" IOS_SCHEME="$scheme" IOS_PROJECT="$project" ./scripts/ios-resolve-preview-device.sh shell)"
eval "$resolver_output"
export IOS_DEVICE_ID IOS_XCODE_DEVICE_ID IOS_DESTINATION

echo "CoreDevice id: $IOS_DEVICE_ID"
echo "Xcode destination id: $IOS_XCODE_DEVICE_ID"
echo "Xcode destination: $IOS_DESTINATION"

details_json="$(mktemp "${TMPDIR:-/tmp}/issuectl-preview-device-details.XXXXXX")"
lock_json="$(mktemp "${TMPDIR:-/tmp}/issuectl-preview-device-lock.XXXXXX")"
trap 'rm -f "$details_json" "$lock_json"' EXIT

xcrun devicectl device info details \
  --device "$IOS_DEVICE_ID" \
  --json-output "$details_json" \
  --quiet \
  --timeout 10 >/dev/null

xcrun devicectl device info lockState \
  --device "$IOS_DEVICE_ID" \
  --json-output "$lock_json" \
  --quiet \
  --timeout 10 >/dev/null

echo "Device lock state:"
jq -r '.result | "  passcodeRequired=\(.passcodeRequired) unlockedSinceBoot=\(.unlockedSinceBoot)"' "$lock_json"

passcode_required="$(jq -r '.result.passcodeRequired' "$lock_json")"
if [ "$passcode_required" = "true" ]; then
  echo "The preview iPhone is locked. Unlock iPhone-preview and retry." >&2
  exit 69
fi

echo "Xcode version:"
xcodebuild -version

echo "Preflight passed."

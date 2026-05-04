#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${IOS_DEV_PORT:-3847}"
PROJECT="${IOS_DEV_PROJECT:-ios/IssueCTL.xcodeproj}"
SCHEME="${IOS_DEV_SCHEME:-IssueCTL}"
CONFIGURATION="${IOS_DEV_CONFIGURATION:-Debug}"
DERIVED_DATA="${IOS_DEV_DERIVED_DATA:-/tmp/issuectl-ios-dev-derived-data}"
SERVER_URL="${IOS_DEV_SERVER_URL:-}"
WEB_LOG="${IOS_DEV_WEB_LOG:-/tmp/issuectl-ios-dev-web.log}"

web_pid=""

cleanup() {
  if [ -n "$web_pid" ] && kill -0 "$web_pid" 2>/dev/null; then
    kill "$web_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT

is_preview_scheme() {
  [[ "$SCHEME" == *Preview* ]]
}

bundle_id() {
  if is_preview_scheme; then
    echo "com.issuectl.ios.preview"
  else
    echo "com.issuectl.ios"
  fi
}

app_name() {
  if is_preview_scheme; then
    echo "IssueCTLPreview"
  else
    echo "IssueCTL"
  fi
}

healthcheck() {
  curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1
}

wait_for_web() {
  for _ in $(seq 1 60); do
    if healthcheck; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for issuectl web on port ${PORT}." >&2
  if [ -f "$WEB_LOG" ]; then
    tail -40 "$WEB_LOG" >&2 || true
  fi
  exit 1
}

resolve_destination_id() {
  if [ -n "${IOS_DEV_SIMULATOR_ID:-}" ]; then
    echo "$IOS_DEV_SIMULATOR_ID"
    return
  fi

  if [ -n "${IOS_DESTINATION:-}" ]; then
    local destination_id
    destination_id="${IOS_DESTINATION##*id=}"
    destination_id="${destination_id%%,*}"
    echo "$destination_id"
    return
  fi

  local destination_id
  destination_id="$(
    xcodebuild -project "$PROJECT" -scheme "$SCHEME" -showdestinations 2>/dev/null \
      | awk '/platform:iOS Simulator/ && /name:iPhone/ { print; exit }' \
      | sed -n 's/.*id:\([^,}]*\).*/\1/p'
  )"

  if [ -z "$destination_id" ]; then
    destination_id="$(
      xcrun simctl list devices available 2>/dev/null \
        | awk -F '[()]' '/iPhone/ { print $2; exit }'
    )"
  fi

  if [ -z "$destination_id" ]; then
    echo "No available iPhone simulator destination found for ${SCHEME}." >&2
    exit 70
  fi

  echo "$destination_id"
}

echo "Building issuectl CLI..."
pnpm --filter @issuectl/cli build

if healthcheck; then
  echo "Reusing existing issuectl web server on port ${PORT}."
else
  echo "Starting issuectl web on port ${PORT}..."
  : > "$WEB_LOG"
  node packages/cli/dist/index.js web --port "$PORT" >"$WEB_LOG" 2>&1 &
  web_pid="$!"
  wait_for_web
fi

destination_id="$(resolve_destination_id)"
destination="platform=iOS Simulator,id=${destination_id}"

echo "Booting simulator ${destination_id}..."
xcrun simctl boot "$destination_id" 2>/dev/null || true

echo "Building ${SCHEME} for ${destination}..."
xcodebuild_args=(
  -project "$PROJECT"
  -scheme "$SCHEME"
  -destination "$destination"
  -configuration "$CONFIGURATION"
  -derivedDataPath "$DERIVED_DATA"
  CODE_SIGNING_ALLOWED=NO
  build
)

if command -v xcpretty >/dev/null 2>&1; then
  set -o pipefail
  xcodebuild "${xcodebuild_args[@]}" | xcpretty
else
  xcodebuild "${xcodebuild_args[@]}"
fi

built_app="$(
  find "$DERIVED_DATA/Build/Products/${CONFIGURATION}-iphonesimulator" \
    -maxdepth 1 \
    -name "$(app_name).app" \
    -print \
    -quit
)"

if [ -z "$built_app" ]; then
  echo "Could not find built app in ${DERIVED_DATA}." >&2
  exit 1
fi

echo "Installing $(basename "$built_app")..."
xcrun simctl install "$destination_id" "$built_app"

echo "Launching $(bundle_id)..."
xcrun simctl launch "$destination_id" "$(bundle_id)" >/dev/null

setup_args=(ios setup --port "$PORT" --simulator)
if [ -n "$SERVER_URL" ]; then
  setup_args+=(--server-url "$SERVER_URL")
fi
if is_preview_scheme; then
  setup_args+=(--preview)
fi

echo "Applying iOS setup link..."
node packages/cli/dist/index.js "${setup_args[@]}"

if [ -n "$web_pid" ]; then
  echo "issuectl web is running for this dev session. Press Ctrl-C to stop it."
  wait "$web_pid"
else
  echo "Done. Existing issuectl web server was left running."
fi

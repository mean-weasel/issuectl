#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${IOS_DEV_PORT:-3847}"
PORT_WAS_EXPLICIT="0"
if [ -n "${IOS_DEV_PORT:-}" ]; then
  PORT_WAS_EXPLICIT="1"
fi
PROJECT="${IOS_DEV_PROJECT:-apple/IssueCTL.xcodeproj}"
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

port_is_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

ios_api_status() {
  curl -sS -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/v1/sessions/previews" 2>/dev/null || true
}

compatible_web_server() {
  local status
  status="$(ios_api_status)"
  case "$status" in
    200|401|500)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

explain_incompatible_web_server() {
  local status
  status="$(ios_api_status)"
  case "$status" in
    404)
      echo "Port ${PORT} is already running an issuectl web server without the current iOS session preview API." >&2
      ;;
    *)
      echo "Port ${PORT} is responding, but the current iOS API could not be verified (HTTP ${status:-none})." >&2
      ;;
  esac
}

find_free_port() {
  local start="$1"
  local candidate
  for candidate in $(seq "$((start + 1))" "$((start + 50))"); do
    if ! port_is_listening "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done

  echo "Could not find a free port near ${start}." >&2
  exit 1
}

wait_for_web() {
  for _ in $(seq 1 60); do
    if healthcheck && [ "$(ios_api_status)" != "404" ]; then
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
  if compatible_web_server; then
    echo "Reusing existing issuectl web server on port ${PORT}."
  elif [ "$PORT_WAS_EXPLICIT" = "1" ]; then
    explain_incompatible_web_server
    echo "Stop that process, or rerun with IOS_DEV_PORT set to a free port." >&2
    exit 1
  else
    explain_incompatible_web_server
    fallback_port="$(find_free_port "$PORT")"
    echo "Using free port ${fallback_port} for this iOS dev session."
    PORT="$fallback_port"
  fi
elif port_is_listening "$PORT"; then
  if [ "$PORT_WAS_EXPLICIT" = "1" ]; then
    echo "Port ${PORT} is already in use." >&2
    echo "Stop that process, or rerun with IOS_DEV_PORT set to a free port." >&2
    exit 1
  fi
  fallback_port="$(find_free_port "$PORT")"
  echo "Port ${PORT} is already in use. Using free port ${fallback_port} for this iOS dev session."
  PORT="$fallback_port"
fi

if ! healthcheck; then
  if [ "$PORT" != "${IOS_DEV_PORT:-3847}" ]; then
    WEB_LOG="/tmp/issuectl-ios-dev-web-${PORT}.log"
  fi
  echo "Starting issuectl web on port ${PORT}..."
  : > "$WEB_LOG"
  node packages/cli/dist/index.js web --port "$PORT" >"$WEB_LOG" 2>&1 &
  web_pid="$!"
  wait_for_web
else
  echo "Using issuectl web on port ${PORT}."
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

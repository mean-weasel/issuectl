#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROFILE="${IOS_UI_SMOKE_PROFILE:-fast}"
DEVICE_NAME="${IOS_DEVICE_NAME:-iPhone-preview}"
STAMP="${IOS_PREVIEW_PERF_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
OUTPUT_DIR="${IOS_PREVIEW_PERF_OUTPUT_DIR:-/tmp}"
LOG_FILE="${IOS_PREVIEW_PERF_LOG:-$OUTPUT_DIR/issuectl-preview-perf-$STAMP.log}"
SUMMARY_FILE="${IOS_PREVIEW_PERF_SUMMARY:-$OUTPUT_DIR/issuectl-preview-perf-$STAMP.summary.txt}"
RESULT_BUNDLE="${IOS_PREVIEW_PERF_XCRESULT:-$OUTPUT_DIR/issuectl-preview-perf-$STAMP.xcresult}"

if [ "$DEVICE_NAME" != "iPhone-preview" ]; then
  echo "Refusing to capture preview performance on unexpected device '$DEVICE_NAME'." >&2
  exit 64
fi

if ! command -v idevicesyslog >/dev/null 2>&1; then
  echo "idevicesyslog is required for physical-device PerformanceTrace capture." >&2
  exit 69
fi

mkdir -p "$OUTPUT_DIR"

echo "Running preview performance preflight."
IOS_DEVICE_NAME="$DEVICE_NAME" pnpm ios:preview-runner-preflight

resolver_output="$(IOS_DEVICE_NAME="$DEVICE_NAME" ./scripts/ios-resolve-preview-device.sh shell)"
eval "$resolver_output"
export IOS_DEVICE_NAME IOS_DEVICE_ID IOS_XCODE_DEVICE_ID IOS_DESTINATION

echo "Capturing PerformanceTrace logs from $DEVICE_NAME."
echo "CoreDevice id: $IOS_DEVICE_ID"
echo "Xcode destination id: $IOS_XCODE_DEVICE_ID"
echo "Xcode destination: $IOS_DESTINATION"
echo "Profile: $PROFILE"
echo "Log file: $LOG_FILE"
echo "Summary file: $SUMMARY_FILE"
echo "Xcode result bundle: $RESULT_BUNDLE"

rm -f "$LOG_FILE" "$SUMMARY_FILE"
rm -rf "$RESULT_BUNDLE"

idevicesyslog -u "$IOS_XCODE_DEVICE_ID" -m '[PerformanceTrace]' --no-colors > "$LOG_FILE" 2>&1 &
log_pid=$!

cleanup() {
  kill "$log_pid" 2>/dev/null || true
}
trap cleanup EXIT

started_at="$SECONDS"
IOS_UI_SMOKE_PROFILE="$PROFILE" \
IOS_XCODEBUILD_EXTRA_ARGS="-allowProvisioningUpdates -allowProvisioningDeviceRegistration -resultBundlePath $RESULT_BUNDLE ${IOS_XCODEBUILD_EXTRA_ARGS:-}" \
  ./scripts/ios-preview-device-smoke.sh
wrapper_elapsed=$((SECONDS - started_at))

sleep 2
cleanup
trap - EXIT

{
  printf 'iOS Preview Performance Summary\n'
  printf 'Captured at: %s\n' "$STAMP"
  printf 'Device: %s\n' "$DEVICE_NAME"
  printf 'CoreDevice id: %s\n' "$IOS_DEVICE_ID"
  printf 'Xcode destination id: %s\n' "$IOS_XCODE_DEVICE_ID"
  printf 'Profile: %s\n' "$PROFILE"
  printf 'Wrapper elapsed seconds: %s\n' "$wrapper_elapsed"
  printf 'Log file: %s\n' "$LOG_FILE"
  printf 'Xcode result bundle: %s\n' "$RESULT_BUNDLE"
  printf '\nKey timings:\n'

  if grep -q 'PerformanceTrace' "$LOG_FILE"; then
    awk '
      /PerformanceTrace/ && /app_launch_usable/ {
        if (match($0, /screen=[^ ]+/)) screen = substr($0, RSTART, RLENGTH);
        if (match($0, /elapsed_ms=[0-9]+/)) print "app_launch_usable " screen " " substr($0, RSTART, RLENGTH);
      }
      /PerformanceTrace/ && /end today\.load/ {
        if (match($0, /elapsed_ms=[0-9]+/)) print "today.load " substr($0, RSTART, RLENGTH);
      }
      /PerformanceTrace/ && /end issues\.load_all/ {
        if (match($0, /elapsed_ms=[0-9]+/)) print "issues.load_all " substr($0, RSTART, RLENGTH);
      }
      /PerformanceTrace/ && /end pulls\.load_all/ {
        if (match($0, /elapsed_ms=[0-9]+/)) print "pulls.load_all " substr($0, RSTART, RLENGTH);
      }
      /PerformanceTrace/ && /end sessions\.load/ {
        if (match($0, /elapsed_ms=[0-9]+/)) print "sessions.load " substr($0, RSTART, RLENGTH);
      }
    ' "$LOG_FILE"

    printf '\nSlowest API requests:\n'
    awk '
      /PerformanceTrace/ && /begin api\.request/ {
        method = "";
        path = "";
        if (match($0, /method=[^ ]+/)) method = substr($0, RSTART, RLENGTH);
        if (match($0, /path=[^ ]+/)) path = substr($0, RSTART, RLENGTH);
        pending[++tail] = method " " path;
      }
      /PerformanceTrace/ && /end api\.request/ {
        elapsed = "";
        request = "";
        status = "";
        if (match($0, /elapsed_ms=[0-9]+/)) elapsed = substr($0, RSTART + 11, RLENGTH - 11);
        if (match($0, /status=[0-9]+/)) status = substr($0, RSTART, RLENGTH);
        if (head < tail) request = pending[++head];
        if (elapsed != "") print elapsed "\t" status "\t" request;
      }
    ' "$LOG_FILE" | sort -nr | head -n 10 | awk -F '\t' '{ printf "api.request elapsed_ms=%s %s %s\n", $1, $2, $3 }'
  else
    printf 'No PerformanceTrace lines found.\n'
  fi
} | tee "$SUMMARY_FILE"

printf '\nPerformanceTrace lines:\n'
grep -n 'PerformanceTrace' "$LOG_FILE" || true

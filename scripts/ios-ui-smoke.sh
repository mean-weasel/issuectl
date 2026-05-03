#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="${IOS_PROJECT:-ios/IssueCTL.xcodeproj}"
SCHEME="${IOS_SCHEME:-IssueCTL-UISmoke}"
CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
PROFILE="${IOS_UI_SMOKE_PROFILE:-full}"
if [ -n "${IOS_UI_TEST_TARGET:-}" ]; then
  UI_TEST_TARGET="$IOS_UI_TEST_TARGET"
elif [[ "$SCHEME" == *"Preview"* ]]; then
  UI_TEST_TARGET="IssueCTLPreviewUITests"
else
  UI_TEST_TARGET="IssueCTLUITests"
fi

if [ -n "${IOS_DESTINATION:-}" ]; then
  DESTINATION="$IOS_DESTINATION"
else
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
    echo "No available iPhone simulator destination found for $SCHEME" >&2
    exit 70
  fi
  DESTINATION="platform=iOS Simulator,id=$destination_id"
fi

FAST_TESTS=(
  "$UI_TEST_TARGET/IssueCTLUITests/testLaunchingIssueCanBeReenteredFromActiveSessions"
)

PR_TESTS=(
  "$UI_TEST_TARGET/IssueCTLUITests/testCreateMinimalDraftIssueFromThumbReachEntryPoint"
  "$UI_TEST_TARGET/IssueCTLUITests/testLaunchingIssueCanBeReenteredFromActiveSessions"
)

FULL_TESTS=(
  "$UI_TEST_TARGET/IssueCTLUITests/testCommandCenterActionsAreReachableFromTabs"
  "$UI_TEST_TARGET/IssueCTLUITests/testCreateDetailedDraftIssueFromThumbReachEntryPoint"
  "$UI_TEST_TARGET/IssueCTLUITests/testListToolbarActionsAreReachableFromTabs"
  "$UI_TEST_TARGET/IssueCTLUITests/testTodayActiveSessionsThumbButtonOpensSessions"
  "$UI_TEST_TARGET/IssueCTLUITests/testLaunchingIssueCanBeReenteredFromActiveSessions"
  "$UI_TEST_TARGET/IssueCTLUITests/testMultipleLaunchedIssueSessionsRemainAvailableFromActiveSessions"
  "$UI_TEST_TARGET/IssueCTLUITests/testRunningIssueDetailShowsReentryInsteadOfLaunch"
)

case "$PROFILE" in
  fast)
    TESTS=("${FAST_TESTS[@]}")
    ;;
  pr)
    TESTS=("${PR_TESTS[@]}")
    ;;
  full)
    TESTS=("${FULL_TESTS[@]}")
    ;;
  *)
    echo "Unknown IOS_UI_SMOKE_PROFILE '$PROFILE'. Expected 'fast', 'pr', or 'full'." >&2
    exit 64
    ;;
esac

args=(
  test
  -project "$PROJECT"
  -scheme "$SCHEME"
  -destination "$DESTINATION"
  -configuration "$CONFIGURATION"
)

if [ -n "${IOS_CODE_SIGNING_ALLOWED:-}" ]; then
  args+=("CODE_SIGNING_ALLOWED=${IOS_CODE_SIGNING_ALLOWED}")
elif [[ "$DESTINATION" == *"iOS Simulator"* ]]; then
  args+=("CODE_SIGNING_ALLOWED=NO")
fi

for test_id in "${TESTS[@]}"; do
  args+=("-only-testing:$test_id")
done

# Pre-boot the simulator so the first test doesn't absorb cold-start latency.
sim_id="${DESTINATION##*id=}"
sim_id="${sim_id%%,*}"
if [ -n "$sim_id" ]; then
  xcrun simctl boot "$sim_id" 2>/dev/null || true
fi

echo "Running $PROFILE iOS UI smoke tests on: $DESTINATION"
if [ -n "${IOS_UI_SMOKE_TIMEOUT:-}" ]; then
  echo "Timeout: ${IOS_UI_SMOKE_TIMEOUT}s"
fi
printf 'Selected tests:\n'
printf '  %s\n' "${TESTS[@]}"
printf 'Started at: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
started_at="$SECONDS"
finish() {
  printf 'Finished at: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf 'Elapsed seconds: %s\n' "$((SECONDS - started_at))"
}
trap finish EXIT

run_xcodebuild() {
  if command -v xcpretty >/dev/null 2>&1; then
    set -o pipefail
    xcodebuild "${args[@]}" | xcpretty
  else
    xcodebuild "${args[@]}"
  fi
}

if [ -n "${IOS_UI_SMOKE_TIMEOUT:-}" ]; then
  run_xcodebuild &
  xcodebuild_pid=$!
  deadline=$((SECONDS + IOS_UI_SMOKE_TIMEOUT))

  while kill -0 "$xcodebuild_pid" 2>/dev/null; do
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "Timed out after ${IOS_UI_SMOKE_TIMEOUT}s waiting for iOS UI smoke tests to finish." >&2
      echo "If this was a physical-device run, unlock the iPhone, keep it awake, and retry." >&2
      pkill -TERM -P "$xcodebuild_pid" 2>/dev/null || true
      kill -TERM "$xcodebuild_pid" 2>/dev/null || true
      sleep 2
      pkill -KILL -P "$xcodebuild_pid" 2>/dev/null || true
      kill -KILL "$xcodebuild_pid" 2>/dev/null || true
      wait "$xcodebuild_pid" 2>/dev/null || true
      exit 124
    fi
    sleep 2
  done

  wait "$xcodebuild_pid"
else
  run_xcodebuild
fi

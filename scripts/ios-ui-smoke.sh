#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="${IOS_PROJECT:-ios/IssueCTL.xcodeproj}"
SCHEME="${IOS_SCHEME:-IssueCTL-UISmoke}"
CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
PROFILE="${IOS_UI_SMOKE_PROFILE:-full}"

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
  "IssueCTLUITests/IssueCTLUITests/testLaunchingIssueCanBeReenteredFromActiveSessions"
)

PR_TESTS=(
  "IssueCTLUITests/IssueCTLUITests/testCreateDraftIssueFromThumbReachEntryPoint"
  "IssueCTLUITests/IssueCTLUITests/testLaunchingIssueCanBeReenteredFromActiveSessions"
)

FULL_TESTS=(
  "IssueCTLUITests/IssueCTLUITests/testCommandCenterActionsAreReachableFromTabs"
  "IssueCTLUITests/IssueCTLUITests/testCreateDraftIssueFromThumbReachEntryPoint"
  "IssueCTLUITests/IssueCTLUITests/testListToolbarActionsAreReachableFromTabs"
  "IssueCTLUITests/IssueCTLUITests/testTodayActiveSessionsThumbButtonOpensSessions"
  "IssueCTLUITests/IssueCTLUITests/testLaunchingIssueCanBeReenteredFromActiveSessions"
  "IssueCTLUITests/IssueCTLUITests/testMultipleLaunchedIssueSessionsRemainAvailableFromActiveSessions"
  "IssueCTLUITests/IssueCTLUITests/testRunningIssueDetailShowsReentryInsteadOfLaunch"
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
  CODE_SIGNING_ALLOWED=NO
)

for test_id in "${TESTS[@]}"; do
  args+=("-only-testing:$test_id")
done

echo "Running $PROFILE iOS UI smoke tests on: $DESTINATION"
printf 'Selected tests:\n'
printf '  %s\n' "${TESTS[@]}"

if command -v xcpretty >/dev/null 2>&1; then
  set -o pipefail
  xcodebuild "${args[@]}" | xcpretty
else
  xcodebuild "${args[@]}"
fi

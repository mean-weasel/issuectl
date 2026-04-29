#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="${IOS_PROJECT:-ios/IssueCTL.xcodeproj}"
SCHEME="${IOS_SCHEME:-IssueCTL-UISmoke}"
CONFIGURATION="${IOS_CONFIGURATION:-Debug}"

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

TESTS=(
  "IssueCTLUITests/IssueCTLUITests/testCommandCenterActionsAreReachableFromTabs"
  "IssueCTLUITests/IssueCTLUITests/testListToolbarActionsAreReachableFromTabs"
  "IssueCTLUITests/IssueCTLUITests/testTodayActiveSessionsThumbButtonOpensSessions"
  "IssueCTLUITests/IssueCTLUITests/testLaunchingIssueCanBeReenteredFromActiveSessions"
  "IssueCTLUITests/IssueCTLUITests/testRunningIssueDetailShowsReentryInsteadOfLaunch"
)

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

echo "Running focused iOS UI smoke tests on: $DESTINATION"

if command -v xcpretty >/dev/null 2>&1; then
  set -o pipefail
  xcodebuild "${args[@]}" | xcpretty
else
  xcodebuild "${args[@]}"
fi

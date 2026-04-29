#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="${IOS_PROJECT:-ios/IssueCTL.xcodeproj}"
SCHEME="${IOS_SCHEME:-IssueCTL}"
CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
DESTINATION="${IOS_DESTINATION:-platform=iOS Simulator,name=iPhone 16}"

TESTS=(
  "IssueCTLUITests/IssueCTLUITests/testCommandCenterActionsAreReachableFromTabs"
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

#!/usr/bin/env bash
set -euo pipefail

echo "CoreDevice devices:"
xcrun devicectl list devices

echo
echo "Xcode destinations for IssueCTLPreview-UISmoke:"
xcodebuild \
  -project ios/IssueCTL.xcodeproj \
  -scheme IssueCTLPreview-UISmoke \
  -showdestinations 2>/dev/null

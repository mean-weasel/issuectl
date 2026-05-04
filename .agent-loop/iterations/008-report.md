# Iteration 8

## Summary

Added a short-lived, in-flight-de-duplicated iOS cache for /api/v1/deployments in APIClient. This reduces duplicate active-deployment requests during tab/detail transitions while keeping the Sessions 10-second poll fresh, and launch/end session mutations now clear the cache.

## Verification

xcodebuild build -project ios/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO passed.

## Process Learning Reflection

- Local-only:
- Candidate skill learning:
- Candidate repo change:
- Upstream review proposed:

## Judge Decision

Seven iterations complete. iOS now avoids redundant user requests; remaining opportunities include URL construction and request/session tuning.

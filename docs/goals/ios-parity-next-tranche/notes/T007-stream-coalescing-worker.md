# T007 Stream Coalescing Worker Receipt

## Result

Done.

## Changes

- Added a small `RefreshCoalescer` in the app target.
- `SessionListView` now coalesces websocket-triggered session overview reloads instead of reloading once per stream message.
- `AutomationFeedView` now coalesces websocket-triggered feed reloads instead of reloading once per stream message.
- Manual refresh, refreshable gestures, and polling remain immediate.
- Coalescers are canceled on view disappearance.

## Verification

Passed:

```bash
git diff --check
```

Passed:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -quiet
```

Observed output included:

```text
Testing started
```

with exit code `0`.

## Notes

- `RepoAutomationActivityView` was intentionally not edited because it does not subscribe to the websocket stream.
- `xcodebuild` regenerated `apple/IssueCTL/Generated/AppVersion.swift`; it was restored to `HEAD` content after the test run because it is outside this Worker package.

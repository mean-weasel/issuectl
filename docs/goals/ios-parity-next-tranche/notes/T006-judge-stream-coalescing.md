# T006 Judge Review: Stream Refresh Coalescing

## Decision

Accept T005 and continue with stream refresh coalescing.

## Evidence

- `SessionListView.streamSessionUpdates()` reloads sessions after every websocket message.
- `AutomationFeedView.streamFeedUpdates()` reloads the full automation feed after every websocket message.
- `RepoAutomationActivityView` does not subscribe to the websocket stream; it loads on task start, refresh, and filter/apply actions. It should not be edited for this slice.

## Worker Objective

Coalesce websocket-triggered refreshes in `SessionListView` and `AutomationFeedView` so bursts of webhook events schedule one delayed refresh instead of one full reload per message.

## Allowed Files

- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- `apple/IssueCTL/Views/Settings/AutomationFeedView.swift`

## Verify

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -quiet
```

Run `git diff --check`.

## Stop If

- Implementation needs files outside the allowed list.
- Coalescing requires changing APIClient stream behavior.
- The coalescer prevents manual refresh or timer refresh from loading immediately.
- Focused compile/test fails twice with the same failure.

## Remaining After This Slice

- Conditional Today/Issues workbench-first-read decision.
- Diagnostics wording cleanup.
- Final simulator/UI proof and final audit.

# T002 Judge Decision: Route-Focus Slice

## Decision

Proceed with route-focus parity as the first Worker package.

## Rationale

This is the largest safe useful first slice because:

- It closes three real user-visible gaps: `/workbench?...`, `/sessions?...`, and `/reviews/...` are parsed but their route context is dropped.
- It does not duplicate already-merged workbench/API/automation/diagnostics/PR review contracts.
- It is bounded to SwiftUI routing, route consumers, and model/store helper tests.
- It creates immediate behavior users can verify with simulator deep links.

## Worker Objective

Preserve Board/Sessions/Review route context in `ContentView`, pass the pending route to `BoardView` and `SessionListView`, and consume it to focus board repo/deployment, sessions repo filter, and review detail.

## Allowed Files

- `apple/IssueCTL/App/ContentView.swift`
- `apple/IssueCTL/Views/Workbench/BoardView.swift`
- `apple/IssueCTL/ViewModels/WorkbenchStore.swift`
- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- `apple/IssueCTLTests/ViewLogicTests.swift`
- `apple/IssueCTLTests/WorkbenchStoreTests.swift`

## Verify

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -only-testing:IssueCTLTests/WorkbenchStoreTests \
  -quiet
```

If the simulator name is unavailable, list simulators and use the nearest available iPhone simulator without changing the test scope.

## Stop If

- Implementation needs files outside `allowed_files`.
- The route consumer requires a new app-wide state architecture.
- Current-main code already consumes one of these routes and the Scout evidence is stale.
- Focused tests fail twice with the same failure.
- UI route behavior cannot be represented without a product decision.

## Deferred Candidates

- Public webhook base URL editing and unknown-state health presentation should be the next likely slice after route-focus.
- Stream refresh coalescing is safe but less user-visible.
- Today/Issues workbench first-read consistency needs a separate Judge decision because it may imply larger architecture.
- Terminal backend override remains deferred pending owner product decision.

# T008 Judge Review: Cleanup and Today/Issues Decision

## Decision

Accept T007 and continue with diagnostics wording cleanup.

## Today/Issues Workbench-First-Read Decision

Defer for this tranche.

Evidence:

- `TodayView` reads repos, active deployments, repo issues, and repo pulls through existing endpoint-specific flows.
- `IssueListView` reads repos, active deployments, repo issues, drafts, priorities, filters, scene storage, search, offline sync state, launch targets, and detail navigation.
- `BoardView` already owns the `/api/v1/workbench` first-read path through `WorkbenchStore`.

Replacing Today/Issues first-read behavior safely would require a new shared mapping layer or app-level store decision, not a small continuation slice. That violates this tranche's constraint to avoid inventing a new global state container. The deferral is explicit and preserves current behavior.

## Worker Objective

Update current-main diagnostics wording so it no longer implies the mobile diagnostics endpoint is merely a future dependency from issue `#546`, while keeping fallback copy for older connected servers that return `404`.

## Allowed Files

- `apple/IssueCTLShared/Services/APIClient.swift`
- `apple/IssueCTL/Views/Sessions/SessionListView.swift`

## Verify

```bash
git diff --check
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/APIClientTests \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -quiet
```

## Stop If

- Cleanup changes diagnostics behavior or endpoint paths.
- Implementation needs files outside the allowed list.
- Focused tests fail twice with the same failure.

## Remaining After This Slice

- Final focused/full verification.
- Simulator/UI proof for route/settings behavior, or an explicit PM receipt if local app configuration blocks proof.
- Final audit.

# T002 Judge: Workbench Bootstrap Slice

result: done

decision: approved

summary: Proceed with a bounded iOS workbench contract plus pure bootstrap mapper/store foundation. Do not wire TodayView, IssueListView, PRListView, drafts, offline queue, or navigation flows in this slice.

## Chosen Slice

Add:

- Swift `WorkbenchPayload` decoding models for `/api/v1/workbench`.
- `APIClient.workbench()` fetch support.
- A pure `WorkbenchBootstrap` projection for repos, issue summaries, active issue deployments, priority maps, and stable owner/repo/number lookup keys.
- Focused decoding and mapper tests.

This creates executable architecture proof while preserving endpoint-specific behavior.

## Rejected Alternatives

- Rewrite Today and Issues to read directly from `/api/v1/workbench`: rejected because drafts, offline queue, and navigation parity are not proven.
- Wire `IssueListView` in T003: rejected because draft refresh, priority refresh, launch, terminal, and offline paths need a follow-up integration review.
- Route `PRListView` through workbench: rejected because the payload does not provide full PR-list parity.
- Move priority mutations or offline queue into workbench: rejected because only read mapping is safe.
- Include webhook automation health in this first-read slice: rejected as separate settings/health parity work.

## Allowed Files

- `apple/IssueCTLShared/Models/WorkbenchPayload.swift`
- `apple/IssueCTLShared/Models/WorkbenchBootstrap.swift`
- `apple/IssueCTLShared/Services/APIClient+Workbench.swift`
- `apple/IssueCTLTests/WorkbenchPayloadDecodingTests.swift`
- `apple/IssueCTLTests/WorkbenchBootstrapMapperTests.swift`
- `apple/IssueCTL.xcodeproj/project.pbxproj`
- `docs/goals/ios-workbench-first-read-architecture/notes/T003-worker-workbench-bootstrap.md`

## Verification

- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLTests/WorkbenchPayloadDecodingTests -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests`
- `pnpm --dir packages/web test -- app/api/v1/workbench/route.test.ts components/workbench/workbench.test.ts`
- `git diff --name-only`
- `git diff -- apple/IssueCTL/Views/Today/TodayView.swift apple/IssueCTL/Views/Issues/IssueListView.swift apple/IssueCTL/Views/PullRequests/PRListView.swift apple/IssueCTL/Views/Issues/DraftDetailView.swift apple/IssueCTL/Services/OfflineSyncService.swift apple/IssueCTL/Helpers/RepoFilterHelpers.swift`

## Stop If

- Need to edit outside allowed files.
- Need to modify Today, Issues, PRs, DraftDetail, OfflineSyncService, RepoFilterHelpers, existing deployment/session changes, or web workbench implementation.
- Mapper would convert partial workbench summaries into full `GitHubIssue` or PR detail models.
- Payload lacks owner, repo, issue number, priority, deployment target type, or cache metadata needed for a lossless bootstrap projection.
- Focused tests fail twice with the same failure.

## Receipt Requirements For T003

T003 must include a ledger for Today, Issues, PRs, drafts, priorities, offline queue, repo filters, issue navigation, and PR navigation, plus the strongest realistic failure mode and proof against it.

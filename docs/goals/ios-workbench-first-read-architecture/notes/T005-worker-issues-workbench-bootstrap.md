result: done
summary: >
  Wired IssueListView to use WorkbenchBootstrap as a non-blocking metadata
  bootstrap for active issue deployments and priority seeds while retaining the
  endpoint-specific issue load, drafts load, repo filtering, launch/terminal
  behavior, priority refresh, offline queue behavior, and detail navigation.

files_changed:
  - apple/IssueCTL/Views/Issues/IssueListView.swift
  - apple/IssueCTLShared/Models/WorkbenchBootstrap.swift
  - apple/IssueCTLTests/ViewLogicTests.swift

verification:
  - command: "xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,id=43EC89AF-7DE4-43C4-83F7-4AB65AC7F0BC' -only-testing:IssueCTLTests/ViewLogicTests -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests -only-testing:IssueCTLTests/WorkbenchPayloadDecodingTests"
    result: passed
    evidence: "Executed 74 tests, with 0 failures; ** TEST SUCCEEDED ** on Seatify-iPhone16."
  - command: "git diff --check -- apple/IssueCTL/Views/Issues/IssueListView.swift apple/IssueCTLShared/Models/WorkbenchBootstrap.swift apple/IssueCTLTests/ViewLogicTests.swift apple/IssueCTLTests/WorkbenchBootstrapMapperTests.swift"
    result: passed
    evidence: "Scoped whitespace check exited 0."
  - command: "git diff --name-only"
    result: inspected
    evidence: >
      Root worktree remains broadly dirty from pre-existing unrelated work. T005
      worker changes are limited to IssueListView.swift, WorkbenchBootstrap.swift,
      ViewLogicTests.swift, and this receipt.
  - command: "git diff -- apple/IssueCTL/Views/Today/TodayView.swift apple/IssueCTL/Views/PullRequests/PRListView.swift apple/IssueCTL/Views/Issues/DraftDetailView.swift apple/IssueCTL/Services/OfflineSyncService.swift apple/IssueCTL/Helpers/RepoFilterHelpers.swift"
    result: inspected
    evidence: >
      The command reports only a RepoFilterHelpers.swift diff adding issue-target
      checks. That file was already dirty before T005 and was not modified by
      this Worker; no TodayView, PRListView, DraftDetailView, or OfflineSyncService
      diff appeared.

burden_of_proof:
  strongest_failure_mode: >
    Workbench-first-read metadata could accidentally replace authoritative issue
    endpoint data or block the existing refresh path when the aggregate endpoint
    fails.
  evidence: >
    IssueListView still fetches repo issues through the existing per-repo issue
    endpoints and loads drafts separately. The workbench fetch is awaited as an
    independent Result; failure clears the bootstrap and does not append to the
    user-visible endpoint failure list. ViewLogicTests prove the new helpers fall
    back to bootstrap deployments, prefer endpoint deployments when present,
    deduplicate merged deployment rows, and seed priorities from bootstrap
    without skipping the existing priority refresh path.

deferred:
  - "TodayView remains endpoint-specific pending Judge final audit."
  - "PRListView and PR detail/list models remain endpoint-specific pending Judge final audit."
  - "DraftDetailView and OfflineSyncService remain unchanged."

result: done
summary: >
  Wired TodayView to consume WorkbenchBootstrap only as active issue deployment
  metadata. Today continues to load repos, GitHub issues, GitHub pulls, current
  user state, cache/offline state, and issue/PR navigation through the existing
  endpoint-specific paths. The workbench fetch now runs after the normal Today
  load path has populated state, is generation-guarded, and failure does not
  block or surface as a Today load error.

files_changed:
  - apple/IssueCTL/Views/Today/TodayView.swift
  - apple/IssueCTLTests/ViewLogicTests.swift

verification:
  - command: "xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,id=43EC89AF-7DE4-43C4-83F7-4AB65AC7F0BC' -only-testing:IssueCTLTests/ViewLogicTests -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests -only-testing:IssueCTLTests/WorkbenchPayloadDecodingTests"
    result: passed_after_simulator_reboot
    evidence: >
      First run failed before tests with FBSOpenApplicationServiceErrorDomain
      Busy/Application failed preflight checks. After booting the simulator, the
      retry executed 77 tests with 0 failures; ** TEST SUCCEEDED **.
  - command: "pnpm --dir packages/web test -- app/api/v1/workbench/route.test.ts components/workbench/workbench.test.ts"
    result: passed
    evidence: "2 test files passed, 17 tests passed."
  - command: "git diff --check -- apple/IssueCTL/Views/Today/TodayView.swift apple/IssueCTLShared/Models/WorkbenchBootstrap.swift apple/IssueCTLTests/ViewLogicTests.swift apple/IssueCTLTests/WorkbenchBootstrapMapperTests.swift"
    result: passed
    evidence: "Scoped whitespace check exited 0."
  - command: "git diff -- apple/IssueCTL/Views/Issues/IssueListView.swift apple/IssueCTL/Views/PullRequests/PRListView.swift apple/IssueCTL/Views/Issues/DraftDetailView.swift apple/IssueCTL/Services/OfflineSyncService.swift apple/IssueCTL/Helpers/RepoFilterHelpers.swift"
    result: inspected
    evidence: >
      The command reports the prior T005 IssueListView bootstrap diff plus
      pre-existing RepoFilterHelpers.swift issue-target checks. No PRListView,
      DraftDetailView, or OfflineSyncService diff appeared.

burden_of_proof:
  strongest_failure_mode: >
    Today could turn /api/v1/workbench into a blocking dependency or use partial
    workbench issue summaries/PR metadata instead of authoritative endpoint data.
  evidence: >
    TodayView still starts from api.repos(), api.issues(), api.pulls(),
    api.activeDeployments(), and api.currentUser(). The workbench fetch is kicked
    off only after the normal load path has computed issues, pulls, cache dates,
    and offline flags; failure clears the bootstrap and does not set
    errorMessage. ViewLogicTests prove workbench deployments can be appended,
    deduplicated against endpoint rows, and limited to the bootstrap's active
    issue deployments.

deferred:
  - "PRListView remains endpoint-specific because the workbench payload does not provide full PR list parity."
  - "DraftDetailView and OfflineSyncService remain unchanged."

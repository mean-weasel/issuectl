result: done
summary: >
  Implemented the first iOS workbench contract slice: a Swift WorkbenchPayload
  model matching the web aggregate payload, APIClient.workbench() fetch support,
  and a pure WorkbenchBootstrap projection that indexes partial issue summaries,
  active issue deployments, and priorities without converting summaries into
  full GitHubIssue or PR detail models.

files_changed:
  - apple/IssueCTLShared/Models/WorkbenchPayload.swift
  - apple/IssueCTLShared/Models/WorkbenchBootstrap.swift
  - apple/IssueCTLShared/Services/APIClient+Workbench.swift
  - apple/IssueCTLTests/WorkbenchPayloadDecodingTests.swift
  - apple/IssueCTLTests/WorkbenchBootstrapMapperTests.swift
  - apple/IssueCTL.xcodeproj/project.pbxproj

verification:
  - command: "xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLTests/WorkbenchPayloadDecodingTests -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests"
    result: interrupted
    evidence: >
      The requested named destination stalled in Xcode physical-device discovery
      and repeatedly logged a passcode-protected attached iPhone. xcodebuild
      -showdestinations did not list a simulator named exactly "iPhone 16".
  - command: "xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,id=43EC89AF-7DE4-43C4-83F7-4AB65AC7F0BC' -only-testing:IssueCTLTests/WorkbenchPayloadDecodingTests -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests"
    result: passed
    evidence: "Executed 4 tests, with 0 failures; ** TEST SUCCEEDED ** on Seatify-iPhone16."
  - command: "pnpm --dir packages/web test -- app/api/v1/workbench/route.test.ts components/workbench/workbench.test.ts"
    result: passed
    evidence: "2 test files passed, 17 tests passed."
  - command: "git diff --name-only"
    result: inspected
    evidence: >
      Root worktree remains broadly dirty from pre-existing unrelated work.
      T003 additions are the five new workbench Swift/test files plus
      apple/IssueCTL.xcodeproj/project.pbxproj.
  - command: "git diff -- apple/IssueCTL/Views/Today/TodayView.swift apple/IssueCTL/Views/Issues/IssueListView.swift apple/IssueCTL/Views/PullRequests/PRListView.swift apple/IssueCTL/Views/Issues/DraftDetailView.swift apple/IssueCTL/Services/OfflineSyncService.swift apple/IssueCTL/Helpers/RepoFilterHelpers.swift"
    result: inspected
    evidence: >
      The command reports a RepoFilterHelpers.swift diff adding issue-target
      checks. That file was already dirty before T003 and was not modified by
      this Worker; no TodayView, IssueListView, PRListView, DraftDetailView, or
      OfflineSyncService diff appeared.

burden_of_proof:
  strongest_failure_mode: >
    The new iOS model could accidentally collapse partial workbench summaries
    into issue-specific state or mis-key same-number issues across repos.
  evidence: >
    WorkbenchBootstrapMapperTests exercises duplicate issue numbers across
    repos, ignores active PR deployments in issue lookup, ignores ended issue
    deployments, and verifies priority projection/defaulting. Payload decoding
    tests preserve PR completions with issue_number null and target_type pr.

deferred:
  - "No Today/Issues/PR UI wiring in this slice by Judge instruction."
  - "No drafts, offline queue, navigation, repo filter, or webhook settings parity changes in this slice."

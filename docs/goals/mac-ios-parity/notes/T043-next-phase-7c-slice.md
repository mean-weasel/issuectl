# T043 Phase 7C Slice Decision

Decision: approved.

Next worker: T044.

Scope: finish the remaining Phase 7 linked-navigation acceptance gap before moving to Phase 8. The PR should let a user open a linked issue from PR detail and open a linked PR from issue detail, preserving the current repo context and using existing shared API detail endpoints.

Branch strategy:
- integration branch: mac-sidebar-spaces-option-a
- worker branch: mac-parity-phase-7c-linked-navigation
- PR base: mac-sidebar-spaces-option-a

Allowed files:
- apple/IssueCTLMac/Views/MacPullRequestsView.swift
- apple/IssueCTLMac/Views/MacIssueDetailView.swift
- apple/IssueCTLMac/App/IssueCTLMacApp.swift
- apple/IssueCTLMacUITests/**
- docs/goals/mac-ios-parity/**

Verification:
- git diff --check
- xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase7c-dd -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests
- pnpm typecheck
- pnpm lint

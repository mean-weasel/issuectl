# iOS Web Workbench Parity

## Purpose

This note records the mobile parity contract implemented for the iOS app after the web workbench, webhook automation, cross-repo Board, and PR review session work.

The iOS app now mirrors the current web app's core operational model:

- `/api/v1/workbench` is the summary read path for the native Board.
- Issue and PR detail screens continue to use their detail endpoints for full bodies, comments, checks, and mutations.
- Deployments are target-aware and can represent either issue work sessions or PR review sessions.
- Repo automation settings expose issue auto-launch, PR auto-review, agent defaults, review preamble, webhook payload mode, webhook health/configuration, and automation-label recreation.
- Issue detail supports the `issuectl:auto-launch` automation label with webhook health context.
- PR detail supports the `issuectl:auto-review` automation label with webhook health context.

## Mobile API Surface

Summary data:

```text
GET /api/v1/workbench
```

Mobile automation support:

```text
GET  /api/v1/repos/:owner/:repo/webhook/health
POST /api/v1/repos/:owner/:repo/webhook
POST /api/v1/repos/:owner/:repo/labels/recreate
POST /api/v1/issues/:owner/:repo/:number/labels
POST /api/v1/pulls/:owner/:repo/:number/labels
PATCH /api/v1/repos/:owner/:repo
```

Session lifecycle:

```text
POST /api/v1/deployments/:id/end
```

The end-session body includes `targetType` and `targetNumber`, so PR review sessions are not treated as issue sessions.

## QA Recipe

Run focused checks for changed surfaces:

```bash
git diff --check
pnpm --dir packages/web test -- workbench
pnpm --dir packages/web test -- webhook
pnpm --dir packages/web test -- labels
pnpm --dir packages/web typecheck
```

Run iOS focused suites or equivalent `xcodebuildmcp test_sim` selections:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/EnumTests -only-testing:IssueCTLTests/ModelDecodingTests -only-testing:IssueCTLTests/APIClientTests -only-testing:IssueCTLTests/APIClientExtensionTests
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/IssueCTLUITests/testBoardTabShowsCrossRepoIssueQueueAndRunningFilter
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/IssueCTLUITests/testPullRequestSessionControlsOpenPullRequestDetail -only-testing:IssueCTLUITests/IssueCTLUITests/testEndingPullRequestSessionSendsTargetAwareBody
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/SettingsTests
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/IssueDetailActionTests/testIssueAutoLaunchLabelControlTogglesAutomationLabel -only-testing:IssueCTLUITests/PRBrowseTests/testPRAutoReviewLabelControlTogglesAutomationLabel
```

Manual simulator QA:

- Board tab loads the cross-repo issue queue from the mock or local web server.
- Board running filter shows issue sessions and excludes PR review sessions from issue cards.
- Active tab shows PR review sessions as PRs and opens PR detail from session controls.
- Ending a PR review session sends `targetType: "pr"` and the PR number.
- Repo settings show automation toggles, agent choices, review preamble, payload mode, webhook health, webhook install/rotate, and label recreation.
- Issue detail can add or remove `issuectl:auto-launch`.
- PR detail can add or remove `issuectl:auto-review`.
- Webhook health warnings are visible in settings and automation-label context.

## Recorded Follow-Ups

- Today and Issues can be migrated to workbench summaries as their first read path. They still work through existing fetch flows.
- A dedicated automation activity surface can show recent webhook events and PR review records. The workbench models already decode those fields, and the current app exposes health, settings, labels, and active PR review session state.
- Before merge, let CI repeat the broad web/core/iOS verification. A fresh-worktree local PR-hardening pass completed after this note was first written.

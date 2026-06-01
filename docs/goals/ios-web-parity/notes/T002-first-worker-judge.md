# T002 Judge Receipt: First Worker Slice

## Result

`done`

## Decision

`approved`

## Rationale

T001 produced enough evidence to approve the first implementation slice. The first Worker should not build the new Board tab yet. It should first make the app and mobile API layer understand the current web/core contract:

- GitHub `main` already contains the web workbench aggregate route and most webhook automation machinery.
- iOS on GitHub `main` cannot decode current target-aware PR deployments because `ActiveDeployment.issueNumber` is required and there is no `targetType`/`targetNumber`.
- iOS has no `/api/v1/workbench` client/model.
- iOS repo settings models do not expose automation fields.
- Two mobile REST gaps remain: webhook health and PR label toggle.

The Scout recommendation is accepted with one adjustment: the Worker may include the minimal existing iOS session/detail files needed to keep current Active/Issue flows target-safe after deployment decoding changes. This is not the new Board UI; it is compatibility work required by the contract slice.

## First Worker Objective

Implement the contracts/API foundation for iOS web parity:

1. Extend Swift repo/deployment models for automation fields and target-aware sessions.
2. Add Swift workbench payload models.
3. Add API client methods for workbench, automation repo updates, webhook configuration/health, repo label recreation, and PR label toggling.
4. Add missing mobile REST endpoints for webhook health and PR label toggling with tests.
5. Extend the iOS mock server and focused tests.
6. Port the minimal target-aware existing session/detail safety changes from the active dirty checkout so PR deployments do not crash or masquerade as issue sessions.

## Allowed Files

- `apple/IssueCTLShared/Models/Repo.swift`
- `apple/IssueCTLShared/Models/Deployment.swift`
- `apple/IssueCTLShared/Models/Workbench.swift`
- `apple/IssueCTLShared/Services/APIClient.swift`
- `apple/IssueCTLShared/Services/APIClient+Settings.swift`
- `apple/IssueCTLShared/Services/APIClient+DetailActions.swift`
- `apple/IssueCTL/Helpers/RepoFilterHelpers.swift`
- `apple/IssueCTL/Views/Issues/IssueDetailView.swift`
- `apple/IssueCTL/Views/Launch/LaunchView.swift`
- `apple/IssueCTL/Views/Sessions/SessionListView.swift`
- `apple/IssueCTL/Views/Sessions/SessionRowView.swift`
- `apple/IssueCTL/Views/Terminal/TerminalView.swift`
- `apple/IssueCTLTests/EnumTests.swift`
- `apple/IssueCTLTests/ModelDecodingTests.swift`
- `apple/IssueCTLTests/APIClientTests.swift`
- `apple/IssueCTLTests/APIClientExtensionTests.swift`
- `apple/IssueCTLUITests/Helpers/MockServer.swift`
- `packages/web/app/api/v1/repos/[owner]/[repo]/webhook/health/route.ts`
- `packages/web/app/api/v1/repos/[owner]/[repo]/webhook/health/route.test.ts`
- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.ts`
- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.test.ts`
- `docs/goals/ios-web-parity/**`

## Implementation Guidance

- Preserve the useful dirty active-checkout target-aware session work, but re-apply it against GitHub `main`; do not copy dirty web files wholesale.
- It is acceptable for `ActiveDeployment.issueNumber` to remain a compatibility convenience if PR sessions also expose `targetType`, `targetNumber`, and all issue matching gates on `targetType == .issue`. If the Worker can make `issueNumber` optional without broad churn, prefer the more semantically exact model.
- Do not introduce the Board tab, WorkbenchStore UI, or repo automation settings UI in this slice.
- Keep webhook health REST tests mocked; do not require live GitHub access.
- Reuse existing `togglePullLabel`/core label helper behavior for PR label REST.
- Keep generated `apple/IssueCTL/Generated/AppVersion.swift` out of the slice.

## Verify

Run as many of these as the environment permits, recording exact failures:

- `git diff --check`
- `pnpm --dir packages/web test -- webhook`
- `pnpm --dir packages/web test -- labels`
- `pnpm --dir packages/web test -- workbench`
- `pnpm --dir packages/web typecheck`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLTests/EnumTests`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLTests/ModelDecodingTests`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLTests/APIClientTests`

Use `xcodebuildmcp` for equivalent iOS test invocations if available in the execution environment.

## Stop If

- New Swift files require XcodeGen/project-file changes outside the allowed scope.
- Webhook health cannot be tested without real GitHub credentials.
- PR label REST cannot safely share existing label mutation behavior.
- The app needs broad navigation/routing changes to compile after the contract updates.
- Any implementation requires files outside the allowed list.

## Next Task

Activate `T003` Worker with the allowed file set above.

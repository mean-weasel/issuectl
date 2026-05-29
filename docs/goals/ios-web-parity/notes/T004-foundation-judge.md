# T004 Judge Receipt: Contracts/API Foundation Review

## Decision

`board_slice_ready`

## Review Summary

The T003 foundation is ready for the next visible Board/Workbench slice. The changed Swift contracts now decode the current web workbench shape, preserve old issue-session payloads, and keep PR sessions target-aware instead of routing them through issue-only assumptions. The two iOS-facing REST gaps identified by T001/T002 are present and covered by focused tests.

## Evidence Checked

- `Deployment` and `ActiveDeployment` now decode `targetType`, `targetNumber`, agent, trigger, terminal backend, and webhook metadata while defaulting old payloads to issue targets.
- PR deployment payloads with `issueNumber: null` decode through `targetType == .pr` and `targetNumber`; touched issue active-session matching gates on `.issue`.
- `APIClient.workbench(refresh:maxAge:)` calls `/api/v1/workbench`, shares the existing in-memory/offline-cache pattern, and clears stale workbench data after configuration, repo, session, and label mutations.
- Repo automation models and settings requests cover `autoLaunchIssues`, `autoReviewPrs`, `issueAgent`, `reviewAgent`, `reviewPreamble`, `webhookPayloadMode`, and webhook install/configuration controls.
- iOS now has callable routes for webhook health and PR label toggles:
  - `GET /api/v1/repos/[owner]/[repo]/webhook/health`
  - `POST /api/v1/pulls/[owner]/[repo]/[number]/labels`
- Mock-server and unit fixtures use the web app's camelCase workbench contract.

## Verification Reviewed

- `git diff --check` passed after final generated-file cleanup.
- `/Users/neonwatty/Desktop/issuectl/node_modules/.bin/vitest run labels workbench 'app/api/v1/repos/[owner]/[repo]/webhook/health/route.test.ts' 'app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.test.ts'` passed: 6 files, 27 tests.
- `/Users/neonwatty/Desktop/issuectl/node_modules/.bin/tsc --noEmit` passed from `packages/web`.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/EnumTests -only-testing:IssueCTLTests/ModelDecodingTests -only-testing:IssueCTLTests/APIClientTests -only-testing:IssueCTLTests/APIClientExtensionTests` passed: 140 tests.

## Remaining Risk

The visible iOS Board, WorkbenchStore, automation settings UI, and label-control UI are still unimplemented. Direct fresh-checkout `pnpm --dir packages/web ...` commands remain blocked by missing local JS binaries/offline package cache, so final PR readiness should include a clean dependency install or CI run.

## Next Worker

Activate `T005` to build the native iOS Board tab and `WorkbenchStore` on top of the verified workbench contracts. Keep the slice measurable with mock-server-backed UI behavior and focused iOS tests before moving into automation settings.

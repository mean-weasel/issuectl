# T003 Foundation Worker Receipt

## Result

`done`

The foundation package is implemented in the current dirty root checkout. It adds the missing stable REST contracts for PR labels, diagnostics, deployment diagnostics, and repo webhook health, then exposes the iOS-side API/client types and shared `WorkbenchBootstrap` projections needed by later UI workers.

## Changes

- Added `/api/v1/pulls/:owner/:repo/:number/labels` with route tests for auth, request validation, and GitHub label toggling.
- Added shared diagnostics payload helpers plus:
  - `/api/v1/diagnostics?deploymentId=<id>&limit=<n>`
  - `/api/v1/diagnostics/deployments/:id?limit=<n>`
- Added `/api/v1/repos/:owner/:repo/webhook/health` backed by current-root webhook health inspection.
- Added iOS API support for PR label toggles, deployment diagnostics, and repo webhook health decoding.
- Extended `WorkbenchBootstrap` with projections for automation-enabled repos, active PR deployments, all active deployments, recent completions, webhook events, and PR reviews.
- Added focused Swift tests for the new endpoint contracts and projection indexes.

## Red Proof

- `pnpm --dir packages/web test -- 'app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.test.ts' 'app/api/v1/diagnostics/route.test.ts' 'app/api/v1/diagnostics/deployments/[id]/route.test.ts' 'app/api/v1/repos/[owner]/[repo]/webhook/health/route.test.ts'`
  - Initial result: 4 failed suites because the new route modules did not exist.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests -only-testing:IssueCTLTests/APIClientExtensionTests`
  - Initial result: compile failed on missing `WorkbenchBootstrap` projections and `WorkbenchTargetKey`.

## Green Proof

- `git diff --check`
  - Passed.
- `pnpm --dir packages/web test -- 'app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.test.ts' 'app/api/v1/diagnostics/route.test.ts' 'app/api/v1/diagnostics/deployments/[id]/route.test.ts' 'app/api/v1/repos/[owner]/[repo]/webhook/health/route.test.ts'`
  - Passed: 4 files, 13 tests.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests -only-testing:IssueCTLTests/APIClientExtensionTests`
  - Passed: 45 selected tests, 0 failures.
- `rg --files packages/web/app/api/v1 | rg 'diagnostics|pulls/.*/labels|webhook/health'`
  - Confirmed the current-root route listing includes PR labels, diagnostics, deployment diagnostics, and repo webhook health.

## Notes

- The board's original verifier named `iPhone 16`, but this machine has `iPhone 17`; the first simulator attempt failed only because the requested simulator was unavailable.
- No production GitHub credentials were needed; web route behavior is covered through mocks.
- Broad SwiftUI work remains deferred to the next Judge-selected Worker packages.

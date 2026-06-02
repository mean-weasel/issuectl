# T002 Foundation Slice Decision

## Decision

`proceed`

Execute the first Worker package in the current root checkout, not in a new implementation worktree yet.

## Baseline Handling

The current dirty root is the authoritative baseline for this tranche because it already contains relevant uncommitted iOS PR-target session work and web webhook-health UI work. A fresh worktree from `origin/main` would lose that current product state.

Do not create parallel implementation worktrees until after the foundation package is verified and the WIP baseline is checkpointed. For this first package, continue in the current root while respecting `allowed_files` and preserving unrelated dirty changes.

## Approved Worker Objective

Implement the foundation contracts and projections that unblock iOS workbench automation parity:

1. Add stable REST support for PR label toggling at `/api/v1/pulls/:owner/:repo/:number/labels`.
2. Add API-backed diagnostics read endpoints for deployment timelines:
   - `/api/v1/diagnostics?deploymentId=<id>&limit=<n>`
   - `/api/v1/diagnostics/deployments/:id?limit=<n>`
3. Add a stable repo webhook health API at `/api/v1/repos/:owner/:repo/webhook/health`, using the existing current-root `webhook-health.ts`.
4. Extend `WorkbenchBootstrap` with pure projections for automation repos, active PR deployments, recent completions, webhook events, and PR reviews.
5. Add focused tests/path checks for those contracts and projections.

## Approved Allowed Files

- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.ts`
- `packages/web/app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.test.ts`
- `packages/web/app/api/v1/diagnostics/route.ts`
- `packages/web/app/api/v1/diagnostics/route.test.ts`
- `packages/web/app/api/v1/diagnostics/deployments/[id]/route.ts`
- `packages/web/app/api/v1/diagnostics/deployments/[id]/route.test.ts`
- `packages/web/app/api/v1/repos/[owner]/[repo]/webhook/health/route.ts`
- `packages/web/app/api/v1/repos/[owner]/[repo]/webhook/health/route.test.ts`
- `packages/web/lib/diagnostics-api.ts`
- `packages/web/lib/mobile-api-contracts.ts`
- `apple/IssueCTLShared/Models/WorkbenchBootstrap.swift`
- `apple/IssueCTLShared/Services/APIClient+DetailActions.swift`
- `apple/IssueCTLShared/Services/APIClient+AdvancedSettings.swift`
- `apple/IssueCTLTests/WorkbenchBootstrapMapperTests.swift`
- `apple/IssueCTLTests/APIClientExtensionTests.swift`
- `docs/goals/ios-workbench-automation-parity/notes/**`
- `docs/goals/ios-workbench-automation-parity/state.yaml`

## Verification

- `git diff --check`
- `pnpm --dir packages/web test -- app/api/v1/pulls/[owner]/[repo]/[number]/labels/route.test.ts app/api/v1/diagnostics/route.test.ts app/api/v1/diagnostics/deployments/[id]/route.test.ts app/api/v1/repos/[owner]/[repo]/webhook/health/route.test.ts`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 16' -only-testing:IssueCTLTests/WorkbenchBootstrapMapperTests -only-testing:IssueCTLTests/APIClientExtensionTests`
- Direct inspection that the current-root route listing now includes PR labels, diagnostics, deployment diagnostics, and repo webhook health.

## Stop If

- The Worker needs to revert or normalize unrelated dirty work.
- The Worker needs files outside the approved list.
- Diagnostics payload shape conflicts with core/CLI diagnostics and cannot be resolved from existing code.
- Route tests require live GitHub credentials instead of mocks.
- A broad SwiftUI change becomes necessary before contracts/projections are verified.
- The same verification failure repeats twice for the same underlying cause.

## Deferred

- Cross-repo Board UI.
- PR automation UI affordances.
- Repo automation settings UI.
- Diagnostics UI.
- Sessions overview, webhooks/events, and PR-reviews list APIs unless the foundation Worker discovers they are required for this package.

## Rationale

This is the largest safe useful slice because it changes behavior at the contract/projection layer, unlocks multiple later UI workers, and is verifiable with route tests and Swift model/client tests. Broad SwiftUI work before these contracts would increase churn and could recreate the same private interpretation drift the board is trying to eliminate.

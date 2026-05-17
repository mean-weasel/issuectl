# T002 Contract Decision

## Decision

Approved for Task 1 with mechanical plan/board revisions applied.

## Rationale

The Workbench aggregate API contract, fixture contract, and repo rail badge semantics remain valid:

- The aggregate route is absent, so Task 1 is still the correct first Worker implementation slice.
- Existing APIs required by the aggregate contract are present.
- Repo rail badge semantics should remain live instance count only, matching the mockup and fixture contract.
- Named plain shells remain unsupported by current schema/API and should stay behind the later Judge gate.

T001 found one execution drift unrelated to the aggregate payload itself:

- Current Playwright config uses `testDir: "./e2e"`.
- Existing Playwright specs live under `packages/web/e2e`.
- Current desktop Playwright project is `desktop-chromium`.

The plan and board have been mechanically revised from:

- `packages/web/tests/workbench.spec.ts` to `packages/web/e2e/workbench.spec.ts`
- `tests/workbench.spec.ts` to `e2e/workbench.spec.ts`
- `--project=chromium` to `--project=desktop-chromium`

## Approved Contract

Task 1 may implement `GET /api/v1/workbench` using the plan's `WorkbenchPayload` contract and shared fixture assertions:

- `repos[0].badgeCount === 3`
- `repos[0].issues.length === 4`
- `repos[0].deployments.length === 3`
- `repos[0].previews["7703"].status === "error"`
- `repos[3].issues.length === 0`

## Risks for T003

- The new aggregate route should avoid broad PR detail calls during initial payload assembly.
- Route tests should mock GitHub/core helpers rather than depending on local credentials.
- Pending deployments must remain excluded.
- Partial per-repo issue fetch failures must not fail the entire aggregate response.

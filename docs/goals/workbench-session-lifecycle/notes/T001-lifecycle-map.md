# T001 Workbench Session Lifecycle Map

## Launch Path

- UI launch starts in `packages/web/components/workbench/IssueFocus.tsx` through `launchWorkbenchIssue`.
- Client API helper posts to `/api/v1/launch/:owner/:repo/:number` in `packages/web/components/workbench/workbench-api.ts`.
- Route implementation is `packages/web/app/api/v1/launch/[owner]/[repo]/[number]/route.ts`.
- Core launch orchestration is `packages/core/src/launch/launch.ts`.
- `executeLaunch` does:
  - `verifyTtyd()`
  - read issue detail
  - prepare workspace
  - check `hasLiveDeploymentForIssue`
  - `recordDeployment(... state: "pending")`
  - allocate/reserve ttyd port
  - `spawnTtyd(...)`
  - `updateTtydInfo`
  - `activateDeployment`
- Pending rows are intentionally invisible to UI until terminal spawn succeeds.

## DB Deployment Model

- DB helpers live in `packages/core/src/db/deployments.ts`.
- Active Workbench sessions come from `getActiveDeployments`, which selects `state = 'active' AND ended_at IS NULL`.
- `endDeployment` sets `ended_at = datetime('now')` and clears `idle_since`.
- The live uniqueness rule is `idx_deployments_live` on `(repo_id, issue_number)` where `ended_at IS NULL`.
- Workbench payload does not currently include ended rows because `getWorkbenchPayload` reads `getActiveDeployments`.

## tmux/ttyd Model

- Process helpers live in `packages/core/src/launch/ttyd.ts`.
- `spawnTtyd` creates a tmux session, then starts ttyd with:
  - `ttyd -W -i 127.0.0.1 -p <port> -q tmux attach-session -t <session>`
- `-q` means ttyd can exit while tmux remains the durable session.
- `respawnTtyd` attaches a new ttyd process to an existing tmux session.
- `reconcileOrphanedDeployments` marks deployments ended when tmux is gone. It uses tmux as the liveness signal, not ttyd.

## Workbench Payload and Session Card

- Workbench payload route: `packages/web/app/api/v1/workbench/route.ts`.
- Payload builder: `packages/web/lib/workbench-data.ts`.
- `getWorkbenchPayload` reads active deployments, then captures previews with `getSessionPreviews`.
- Preview capture uses tmux capture-pane in `packages/web/lib/session-previews.ts`.
- UI shell keeps payload in local React state in `packages/web/components/workbench/WorkbenchShell.tsx`.
- Left session cards render in `packages/web/components/workbench/InstancePane.tsx`.
- Session card status is preview-based: `active | idle | error | unavailable`.

## Terminal/Reconnect Path

- Selecting a card calls `selectDeployment` in `WorkbenchShell.tsx`, sets terminal focus, and collapses the Issues drawer.
- Terminal focus component: `packages/web/components/workbench/TerminalFocus.tsx`.
- On mount, it calls `ensureDeploymentTtyd(deployment.id)`.
- Reconnect button in `InstancePane.tsx` calls `reconnectDeployment` in `WorkbenchShell.tsx`, which also calls `ensureDeploymentTtyd`.
- API route: `packages/web/app/api/v1/deployments/[id]/ensure-ttyd/route.ts`.
- Core web helper: `packages/web/lib/ensure-ttyd.ts`.
- `ensureTtydForDeployment` returns:
  - `{ port, terminalToken }` if ttyd PID is alive.
  - `{ port, terminalToken, respawned: true }` if ttyd was dead but tmux existed and respawn succeeded.
  - `{ alive: false, error: "Deployment not found or already ended" }` if row is missing or ended.
  - `{ alive: false, error: "Terminal session has ended" }` after ending deployment if tmux is gone.

## End Path

- End button in `InstancePane.tsx` calls `endSession` in `WorkbenchShell.tsx`.
- Client helper posts to `/api/v1/deployments/:id/end`.
- Route implementation: `packages/web/app/api/v1/deployments/[id]/end/route.ts`.
- Route validates deployment/repo/issue match, kills ttyd and tmux via `killTtyd`, calls `endDeployment`, removes in-progress label, clears caches, and returns `{ success: true }`.
- If deployment is already ended, route returns `{ success: true }`.
- Frontend `removeDeployment` removes the card from payload state and clears selected deployment when needed.

## Existing Tests

- `packages/web/e2e/workbench.spec.ts` covers:
  - session selection opens terminal focus;
  - reconnect happy path via mocked `ensure-ttyd`;
  - end happy path removes card;
  - launch creates a mocked session and terminal iframe;
  - terminal viewport assertions for recent launch fixes.
- `packages/web/e2e/terminal-respawn.spec.ts` covers raw tmux/ttyd respawn mechanics outside Workbench.
- `packages/web/e2e/terminal-persistence.spec.ts` covers older issue-detail terminal persistence with real tmux/ttyd and gh auth, not Workbench.

## Gaps

- No Workbench test for `ensure-ttyd` returning `{ alive: false, error: "Deployment not found or already ended" }`.
- No Workbench test for `{ alive: false, error: "Terminal session has ended" }` after `ensure-ttyd` ends the deployment because tmux is gone.
- No Workbench test that reconnect failure removes, demotes, or refreshes stale cards.
- No Workbench test that `TerminalFocus` failure reconciles selected deployment state.
- No explicit test that end-cancel does not submit, call endpoint, navigate, or reload.
- No Workbench workflow docs for real create/return/reconnect/end/stale/restart sessions.
- Real dogfood mismatch can happen when server-side reconciliation or ensure-ttyd ends the DB row, while the already-loaded React payload still contains the prior active deployment.

## Evidence-Backed Hypotheses

1. The #152 stale card likely came from client state drift: the loaded Workbench payload contained deployment `#152`, but a later `ensure-ttyd` call found the row ended/missing or ended it after tmux was gone. The UI recorded an error on the row instead of refreshing or removing the stale deployment.
2. The full-screen refresh observed around cancel/end may be caused by the current `<details><summary>End</summary>` confirmation using native summary/details behavior combined with page state refresh or browser reload outside the tested happy path. Existing tests confirm confirm-end removal but do not assert cancel is non-navigating and non-mutating.
3. The backend has reasonable primitives for active/ended deployment state, but the `ensure-ttyd` response contract is stringly typed. UI reconciliation currently depends on generic errors, not typed lifecycle status.

## Recommended Next Worker Slice

Start with workflow docs before implementation:

- allowed files: `docs/qa/workbench-session-workflows/**`
- verification:
  - `test -f docs/qa/workbench-session-workflows/README.md`
  - `rg -n "Acceptance criteria|Stop conditions|Playwright" docs/qa/workbench-session-workflows`

Then add mocked Workbench e2e coverage for stale reconnect and end-cancel behavior before changing product code.

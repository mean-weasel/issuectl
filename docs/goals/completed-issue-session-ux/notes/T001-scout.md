# T001 Scout Receipt

## Current Behavior Map

- `packages/web/app/issues/[owner]/[repo]/[number]/page.tsx` fetches issue header data and passes `deployments` into `IssueDetail` and `IssueDetailContent`.
- `packages/web/components/detail/IssueDetail.tsx` computes `hasLiveDeployment` with `deployments.some((d) => d.endedAt === null)` and passes that to issue actions. This is the right live-session invariant to preserve.
- `packages/web/components/detail/LaunchCard.tsx` currently finds only `deployments.find((d) => d.endedAt === null)` and returns `null` if no live deployment exists, so completed sessions have no primary issue-detail evidence.
- `packages/web/components/launch/LaunchActiveBanner.tsx` can render an ended variant, but it is unreachable from issue detail because `LaunchCard` filters ended deployments out.
- `packages/web/components/terminal/OpenTerminalButton.tsx`, `packages/web/lib/terminal-auth.ts`, and `packages/web/lib/pty-terminal-websocket.ts` intentionally require live deployments (`endedAt === null`) before terminal attach. Completed-session UX should not reuse that as a live terminal.
- `packages/web/app/sessions/page.tsx`, `packages/web/lib/sessions-data.ts`, and `packages/web/components/sessions/SessionsReviewList.tsx` already provide a recently-ended session history surface and filters by repo, state, and query.

## Data Available

`Deployment` already includes enough issue-detail data for a completed card:

- `id`, `agent`, `branchName`, `workspaceMode`, `workspacePath`
- `triggeredBy`, `launchedAt`, `endedAt`, `terminalReason`
- `completionResultJson`, `linkedPrNumber`, lineage fields

## Risks And Decisions

- Do not make ended deployments appear active or reusable by `OpenTerminalButton`; existing live terminal auth blocks ended deployment attach.
- The first coherent slice should add completed work evidence and link into completed session history, while preserving "Launch with Codex" as a separate new-run action.
- A true read-only terminal transcript is a larger product/API slice because no stable transcript endpoint exists in the inspected path.

## Recommended Worker Slice

Add an issue-detail completed session summary when there is no live deployment and at least one ended deployment. It should show prior agent work, completion/result metadata when present, branch/workspace evidence, and a link to filtered session history for that issue. Add focused server-rendered component tests proving:

- active deployment still renders Open Terminal and not the completed summary,
- completed deployment renders prior work evidence and the session-history link,
- never-launched issues render no session card.

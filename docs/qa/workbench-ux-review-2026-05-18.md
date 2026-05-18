# Workbench UX Review - 2026-05-18

## Scope

Playwright CLI review of `/workbench` after the issue-focus drawer fix.

Follow-up decision on 2026-05-18: the next Workbench follow-up run is desktop-scoped.
Mobile/narrow Workbench body redesign is intentionally out of scope for that run; any `390px`
or `768px` checks are header/control reachability checks, not acceptance criteria for the
main multi-pane Workbench layout.

The flow under test was:

`/workbench -> repo selection -> issue focus -> drawer toggles -> global modes -> mobile viewport -> populated fixture screenshots`

Browser plugin was not available in this session, so this pass used regular Playwright against `http://localhost:3847/workbench` plus the existing Workbench e2e fixture screenshot test for populated active-session states.

## Evidence

Live screenshots:

- `docs/qa/workbench-ux-artifacts/01-workbench-live-overview.png`
- `docs/qa/workbench-ux-artifacts/02-issue-focus-sessions-collapsed.png`
- `docs/qa/workbench-ux-artifacts/03-issue-focus-sessions-expanded.png`
- `docs/qa/workbench-ux-artifacts/04-global-issues.png`
- `docs/qa/workbench-ux-artifacts/05-board.png`
- `docs/qa/workbench-ux-artifacts/06-prs.png`
- `docs/qa/workbench-ux-artifacts/07-quick-create.png`
- `docs/qa/workbench-ux-artifacts/08-settings.png`
- `docs/qa/workbench-ux-artifacts/09-mobile-workbench.png`
- `docs/qa/workbench-ux-artifacts/10-mobile-workbench-after-wait.png`

Fixture screenshots with populated sessions:

- `docs/qa/workbench-artifacts/workbench-terminal-1440.png`
- `docs/qa/workbench-artifacts/workbench-terminal-1100.png`
- `docs/qa/workbench-artifacts/workbench-issue-1440.png`
- `docs/qa/workbench-artifacts/workbench-board-1440.png`
- `docs/qa/workbench-artifacts/workbench-settings-1440.png`

Console/network:

- `docs/qa/workbench-ux-artifacts/console-live.json`
- Follow-up network probe at desktop and mobile found no failed responses.

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Desktop page identity | Pass | `/workbench`, title `Workbench - issuectl` |
| Desktop blank-page check | Pass | `01-workbench-live-overview.png` |
| Framework overlay check | Pass | No Next/React error overlay in screenshots |
| Issue focus drawer behavior | Pass | `02-issue-focus-sessions-collapsed.png` shows sessions closed and issues visible |
| Drawer manual expansion | Pass | `03-issue-focus-sessions-expanded.png` |
| Global modes | Pass | Screenshots for Issues, Board, PRs, Quick Create, Settings |
| Populated session fixture | Pass | `workbench-terminal-1440.png` |
| Mobile first viewport | Needs work | `10-mobile-workbench-after-wait.png` |

## Findings

### 1. Mobile Workbench Is Functionally Desktop Layout Off-Screen

Current follow-up status: out of scope for the desktop follow-up run. Keep this as a recorded
mobile-web finding, but do not use it as a blocking acceptance criterion for the desktop tranche.

Severity: high for mobile web; medium if desktop web is currently the only target.

At `390 x 844`, the page eventually renders, but the active sessions drawer occupies nearly the whole visible viewport. The focus pane starts at `x=360` with width `440`, and the issue drawer starts at `x=808`, so the main work area is effectively off-screen.

Measured mobile layout:

- viewport: `390 x 844`
- active sessions drawer: `x=68`, width `284`
- focus pane: `x=360`, width `440`
- issues drawer: `x=808`, width `348`

Recommended fix:

- Treat mobile as a single-pane Workbench.
- Default to repo rail + selected focus.
- Make Sessions and Issues true overlay drawers or segmented tabs.
- Collapse both side panes after repo selection on mobile unless explicitly opened.
- Make top navigation horizontally scrollable or move non-primary modes behind a menu.

Acceptance criteria:

- At `390 x 844`, the focus pane begins within the viewport after selecting an issue or repo.
- No primary content starts beyond the right edge.
- Sessions and Issues can still be opened intentionally.
- Playwright asserts the focused pane bounding box intersects at least 80% of the viewport width.

### 2. Active Sessions Drawer Needs Stronger Visual Hierarchy

Severity: medium.

The populated fixture shows the active sessions drawer working, but it is visually heavy and does not yet read like a fast instance manager. Every session card has large borders, large action buttons, and similar visual weight across title, state, preview, reconnect, and end controls. The error card is useful, but it competes with the selected card.

Recommended fix:

- Rename or clarify the drawer title around the intended workflow, e.g. `Running sessions`.
- Convert session cards into denser rows with compact status chips and smaller icon/text actions.
- Make the selected session visually distinct with a lighter left accent or background, not a full heavy border.
- Keep destructive `End` visually secondary and less prominent than `Reconnect/Open`.
- Move `Named shells` into a collapsed footer or hide it until implemented.

Acceptance criteria:

- At `1440 x 1000`, at least four sessions can fit above the fold when previews are short.
- The selected session is distinguishable without making every card feel like a modal.
- Error state remains visible but does not dominate the whole drawer.

### 3. Top Toolbar Crowds Quickly

Severity: medium.

The header currently includes brand, route label, reset widths, drawer toggles, and all nav modes in one row. On mobile the nav is clipped; on desktop it is usable but visually dense.

Recommended fix:

- Move `Reset column widths` into a compact settings/menu affordance.
- Convert Sessions/Issues drawer buttons into icons with tooltips or a small segmented control.
- Keep top-level nav focused on modes; move lower-frequency actions out of the main row.

Acceptance criteria:

- Header controls do not clip at `390`, `768`, `1100`, or `1440` widths.
- The active mode and drawer state remain discoverable.
- No control text overlaps or truncates in the first viewport.

### 4. Issue Detail Contains Deployment History Without Status Context

Severity: medium.

Issue #152 shows deployment entries such as `Deployment 99`, `Deployment 98`, etc. after the sessions are ended. This is not technically stale session UI, but it looks close enough to stale state that it could confuse the operator after cleanup.

Recommended fix:

- Label deployments by state: active, ended, stale-cleaned, linked PR.
- Consider moving ended deployments behind a `History` disclosure.
- For active deployments, provide a clear jump-to-session affordance.

Acceptance criteria:

- Ended deployments are visually distinct from active sessions.
- An issue with no active session never looks like it still has a runnable terminal.

### 5. Issue Mutation Controls Are Dense In The Detail Focus

Severity: low to medium.

The issue detail focus is functional, but priority, comment, close, label, assign, reassign, and attach image controls all compete in a broad grid. It works at desktop width, but the hierarchy is flat.

Recommended fix:

- Group controls into sections: metadata, comment, state, assignment, attachments.
- Make primary issue reading content stronger than mutation controls.
- Consider moving less frequent mutations into an action menu or collapsible section.

Acceptance criteria:

- The issue title/body/comments remain the dominant scan path.
- Controls are grouped by task and keyboard focus order follows those groups.
- At `1100` width controls do not crowd the issue body.

## Suggested Implementation Order

Superseded for the current desktop follow-up: mobile single-pane layout is deferred. The active
desktop tranche should prioritize terminal failure visibility, launch/session discoverability,
issue deployment-history labels, issue detail action grouping, desktop issue queue density, URL
focus state, and QA expectation cleanup.

1. Desktop polish pass for active sessions drawer.
2. Header/toolbars compaction.
3. Issue deployment history state labels.
4. Issue detail control grouping.
5. Mobile single-pane layout.

The active sessions drawer is the best next UX slice because it directly supports the instance-manager goal and is isolated enough to improve without rethinking the entire responsive layout.

## Implemented Follow-Up

### Active Sessions Drawer Polish

Status: implemented.

Files:

- `packages/web/components/workbench/InstancePane.tsx`
- `packages/web/components/workbench/WorkbenchShell.module.css`

Changes:

- Renamed the drawer heading from `Active instances` to `Running sessions`.
- Added a compact active-instance count below the heading.
- Converted session metadata into small status chips for agent and preview status.
- Reduced session row height and spacing so populated drawers scan more like an instance manager.
- Softened selected and error treatment while keeping both states visible.
- Made session actions smaller and right-aligned, with `End` visually secondary to `Reconnect`.
- Quieted the `Named shells` footer until that feature exists.

Verification:

- `pnpm --filter @issuectl/web typecheck`
- `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "collapses workbench drawers|shows sorted session previews|reconnects a session|ends a session|canceling end"`
- `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "passes the responsive QA layout matrix"`
- `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "captures workbench QA screenshots"`

Updated visual evidence:

- `docs/qa/workbench-artifacts/workbench-terminal-1440.png`
- `docs/qa/workbench-artifacts/workbench-terminal-1100.png`

### Header / Toolbar Compaction

Status: implemented.

Files:

- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/components/workbench/WorkbenchShell.module.css`
- `packages/web/e2e/workbench.spec.ts`

Changes:

- Grouped layout reset and drawer toggles into a compact `Workbench layout controls` toolbar cluster.
- Shortened the visible reset control to `Reset` while preserving the accessible name `Reset column widths`.
- Kept `Sessions` and `Issues` drawer toggles visible and stateful.
- Reduced header spacing and allowed the mode nav to scroll within its own region on narrow viewports.
- Removed older responsive CSS that hid reset below `1160px`.

Verification:

- `pnpm --filter @issuectl/web typecheck`
- `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "resizes workbench columns|responsive QA layout|compact header controls|supports top nav modes"`
- `pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "captures workbench QA screenshots"`

Updated visual evidence:

- `docs/qa/workbench-ux-artifacts/11-header-768.png`
- `docs/qa/workbench-ux-artifacts/12-header-390.png`

### Workbench Quality Follow-Up

Status: implemented in the follow-up board.

Covered improvements:

- Direct `/workbench/settings` entry now bootstraps the API token before client-side settings actions.
- Issue queue cards open details from the card body; non-running issue cards use `Prepare launch`, and actual launches remain behind `Launch issue`.
- Repo, issue, session, and mode changes move keyboard focus into the Workbench focus region.
- Issue and terminal focus headers show full repo context.
- Issue focus exposes `Sessions hidden · Show sessions` when active sessions exist behind a collapsed drawer.
- Drawer restore controls occupy reserved grid space and are covered by non-overlap assertions.
- The 1100px desktop matrix checks each visible pane's right edge.
- Issue detail shows labels, uses a real title field, and reports mutation status.
- Screenshot QA waits for loaded content and readable terminal fixture text before capture.
- Repo queue, global issue, and board cards share status/priority chip hooks.

Measured `390px` header state:

- document horizontal overflow: `0`
- reset control: visible, `x=108`, width `43`
- drawer controls: visible, `x=154`, width `107`
- nav region: visible, `x=277`, width `103`, internal scroll width `325`

## Verification Commands Used

```sh
pnpm --filter @issuectl/web typecheck
pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "filters repo issues|checks worktree status|defaults launches"
pnpm --filter @issuectl/web exec playwright test e2e/workbench.spec.ts --project=desktop-chromium --grep "captures workbench QA screenshots"
```

## Notes

- The issue-focus drawer fix is verified separately in `packages/web/e2e/workbench.spec.ts`.
- The mobile screenshot `09-mobile-workbench.png` captured the loading/splash state too early; `10-mobile-workbench-after-wait.png` is the valid mobile rendered-state screenshot.

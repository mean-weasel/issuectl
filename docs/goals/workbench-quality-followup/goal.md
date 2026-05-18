# Workbench Quality Follow-Up Goal

## Objective

Bring the desktop `/workbench` UX from critique-complete to dogfood-ready by fixing the remaining functionality, UX, styling, accessibility, and QA evidence gaps identified by the three independent Workbench reviews.

## Original Request

Use three independent sub-agents to critically analyze the current Workbench for UX improvements, styling improvements, functionality misses, and related issues. Then prepare a detailed GoalBuddy task list so development can proceed with explicit acceptance criteria.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Jeremy as the primary desktop Workbench operator and future GoalBuddy/Codex workers executing the follow-up.
- Authority: `approved`
- Proof type: `test`
- Completion proof: targeted Workbench fixes are implemented, verified with typecheck and focused Playwright coverage, QA/manual workflow docs match current behavior, screenshot evidence waits for loaded content, and a final audit maps every critique finding to either a verified fix or explicit deferral.
- Likely misfire: polishing visual details while leaving fresh-entry auth broken, issue-card actions misleading, keyboard focus unmanaged, 1100px clipping hidden by weak tests, or screenshot artifacts capturing splash/loading states.
- Blind spots considered: mobile/narrow Workbench body redesign remains out of scope for this tranche; live GitHub mutation should remain manual/gated; broad refactors should be avoided unless needed to remove real duplicated issue-card behavior.

## Controlling Findings

- Direct `/workbench/<mode>` loads do not seed the API token the way `/workbench` does.
- Non-running issue cards show `Launch`, but the action only opens details.
- Focus changes scroll the focus pane but do not move keyboard/screen-reader focus into new content.
- Collapsed drawer restore controls can overlap issue/terminal focus headers.
- The supported `1100px` desktop layout can still clip visible panes because current tests do not assert pane right edges.
- Issue detail does not visibly render labels, title editing is synthetic, and mutation feedback is inconsistent.
- Manual dogfooding docs lag current behavior after removing the `Details` button and adding query-addressable focus.
- Screenshot QA can pass while capturing splash/loading states.
- Board/global issue cards drift stylistically from repo issue cards.

## Non-Goals

- Do not redesign mobile/narrow Workbench body layout in this tranche.
- Do not implement named plain shells.
- Do not broaden into unrelated dashboard routes.
- Do not mutate live GitHub data during automated verification.
- Do not start implementation until a `/goal` run activates this board.

## Stop Rule

Stop only when a final audit proves every required desktop acceptance criterion is implemented and verified, or explicitly deferred with owner-approved rationale.

## Canonical Board

Machine truth lives at:

`docs/goals/workbench-quality-followup/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/workbench-quality-followup/goal.md.
```

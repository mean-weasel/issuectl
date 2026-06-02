# Autonomous GoalBuddy Conveyor

Use this runbook when a project has several related implementation slices that
should land as separate PRs, but the overall outcome needs one persistent owner.
It is especially useful after a broad audit finds multiple gaps across web,
Apple clients, webhook automation, docs, and CI.

Do not use a conveyor for a single narrow fix. For small work, a normal
GoalBuddy board or direct implementation branch is easier to review.

## Reusable Prompt

```text
Create an autonomous GoalBuddy conveyor for this project.

Start by auditing the current repo state and recent work, then split the remaining work into vertical-slice child GoalBuddy prep boards under one parent conveyor board. Each child board must have a clear completion proof, verification plan, and adversarial review gate.

Authority boundaries:
- Work one child board at a time.
- Do not mark a child complete until implementation, focused verification, adversarial review, PR creation, CI monitoring, and merge are done.
- If a queued child is already satisfied on main, prove it with code evidence and focused tests, then record it as satisfied rather than inventing work.
- After each merge, update the parent board receipt with PR URL, CI result, merge SHA, and activate the next child.
- If CI fails, inspect logs, fix, push, and re-monitor.
- Continue autonomously until all child boards are merged, proven satisfied, or explicitly blocked with evidence.

Begin by creating/updating the parent GoalBuddy board and the first child board, then run the first slice all the way through PR review, CI, merge, and handoff.
```

## When To Use It

Use the conveyor shape when all of these are true:

- The request is larger than one PR, but the slices share one owner outcome.
- Each slice can be reviewed and merged independently.
- The work benefits from a parent board that remembers which child boards were
  merged, proven satisfied on `main`, or blocked.
- The operator wants autonomous continuation through PR creation, CI monitoring,
  merge, cleanup, and next-slice activation.

Avoid the conveyor shape when the next step is still discovery only, when the
work requires repeated product decisions, or when credentials/devices/test
repos are unavailable and every child would immediately block.

## Adapting Authority Boundaries

Keep the default boundaries strict for production code. Adapt them explicitly
when the project has different risk, CI, or merge rules:

- Replace "merge" with "open a ready PR" when the agent is not authorized to
  land changes.
- Replace "focused tests" with the project-specific proof command, diagnostic
  journal, screenshot, device smoke, or manual runbook that exercises the real
  contract.
- Add a credentials/device stop rule when a child requires production access,
  physical hardware, or destructive operations.
- Add a "satisfied on main" path when prior sessions may already have solved a
  queued child.
- Keep the spelling `conveyor` in board names, issue text, and PR summaries so
  future searches find the pattern.

## Parent Board Receipts

After each child completes, update the parent board with:

- child board path and short objective
- PR URL or satisfied-on-main evidence
- focused verification commands and results
- CI status and merge SHA, when merged
- failure modes considered and the disproof receipt
- next child activated, deferred, or blocked

The parent conveyor is complete only when every child is merged, proven already
satisfied on `main`, or explicitly blocked with evidence and a next owner.

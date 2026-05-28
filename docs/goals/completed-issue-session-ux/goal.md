# Completed Issue Session UX

## Objective

Implement and verify the product UX from issue #531: issue detail pages should make completed agent work visible after a deployment ends, and should offer a completed-session/terminal affordance when terminal evidence remains available, while keeping new launch actions clearly separate.

## Original Request

"Plan out this using GoalBuddy" after identifying that an issue with a completed auto-launched Codex session still showed only "Launch with Codex" despite a retained tmux terminal session and a final `issuectl:deployed` label.

## Intake Summary

- Input shape: `specific`
- Audience: issuectl users manually QAing webhook sessions and normal operators returning to an issue after agent work completed
- Authority: `requested`
- Proof type: `demo`
- Interpreted outcome: Issue detail clearly distinguishes "already worked by an agent" from "ready to launch for the first time," shows completed deployment/session history, and gives access to completed terminal evidence when available.
- Completion proof: Browser walkthrough on issue `mean-weasel/issuectl-test-repo-2#35` or a fresh equivalent fixture shows a completed deployment/history panel with result details and a completed-terminal action, while live sessions still show Open Terminal and new launches remain possible.
- Goal oracle: Focused web tests plus manual/browser QA prove live, completed, and never-launched issue states render the right actions and labels/history.
- Likely misfire: Hiding or replacing "Launch with Codex" without adding completed work evidence, or adding a completed state only to sessions/workbench pages while the primary issue detail remains ambiguous.

## Current Tranche

Discover the existing issue detail/deployment rendering path, design the smallest coherent completed-session UX slice, implement it with focused tests, and manually verify the issue detail behavior against the completed QA issue or a fresh reversible issue.

## Non-Negotiable Constraints

- Preserve existing live deployment behavior: live sessions still show Open Terminal.
- Preserve new launch behavior: users can still launch again after completion when appropriate.
- Do not treat a retained tmux session alone as a live deployment; live state remains keyed by `endedAt === null`.
- Keep the UI clear that completed work is historical evidence, not an active terminal.
- Do not regress issue auto-launch label lifecycle behavior.
- Preserve unrelated dirty worktree changes.

## Stop Rule

Stop only after a final audit maps implementation and verification back to issue #531 and records `full_outcome_complete: true`.

Do not stop after discovery, a UI sketch, or a single unit test if the primary issue detail flow still cannot demonstrate completed session history.

## Canonical Board

Machine truth lives at:

`docs/goals/completed-issue-session-ux/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/completed-issue-session-ux/goal.md.
```

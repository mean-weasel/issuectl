# iOS/Web Parity Conveyor Goal

## Objective

Autonomously run the iOS/web parity work as a queue of mergeable vertical slices. Each child board must move through implementation, adversarial review, PR creation, CI monitoring, green merge, and handoff before the conveyor activates the next board.

## Authority Boundaries

Allowed without further approval:

- Create fresh worktrees and `codex/*` branches.
- Create and update GoalBuddy boards under `docs/goals/`.
- Implement scoped vertical slices from `docs/superpowers/plans/2026-05-31-ios-web-workbench-parity.md`.
- Run local tests, typechecks, lints, iOS simulator builds/tests, and macOS builds.
- Commit, push, open PRs, request adversarial review, fix Critical/Important findings, monitor CI, and merge green PRs using the repository's normal strategy.
- Continue to the next queued child board after a green merge.

Pause for:

- Secrets, credentials, paid external services, or missing GitHub permissions.
- Destructive data changes, force-push/rebase of shared branches, or branch protection blocks.
- Red CI that repeats after reasonable focused fixes.
- Product ambiguity that changes user-visible behavior beyond the accepted parity plan.
- Review findings that require changing the slice boundary or broader architecture.

## Queue

1. `docs/goals/ios-web-parity-conveyor/subgoals/ios-target-aware-sessions/goal.md`
2. `docs/goals/ios-web-parity-conveyor/subgoals/ios-workbench-api-parity/goal.md`
3. `docs/goals/ios-web-parity-conveyor/subgoals/ios-repo-automation-settings/goal.md`
4. `docs/goals/ios-web-parity-conveyor/subgoals/ios-diagnostics-timeline/goal.md`
5. `docs/goals/ios-web-parity-conveyor/subgoals/ios-pr-review-session-controls/goal.md`

## Completion Proof

The conveyor is complete only when every child board has a merged PR or an explicit blocked/deferred receipt, and a final audit maps the merged work back to the original web parity plan.

## Run Command

```text
/goal Follow docs/goals/ios-web-parity-conveyor/goal.md.
```

# iOS Target-Aware Sessions Goal

## Objective

Land the first iOS/web parity slice: native Apple clients decode and display target-aware issue and PR deployments, preserve launch/end-session metadata, and avoid confusing PR sessions with issue sessions.

## Scope

Include:

- Shared Apple deployment/session contract updates.
- Launch response/request and end-session metadata.
- iOS and macOS session/terminal label and navigation guards.
- Focused model/API/view logic tests.
- PR review, CI monitoring, green merge, and conveyor handoff.

Exclude:

- Native `/api/v1/workbench` aggregate refresh.
- Repo automation/webhook settings.
- Diagnostics timeline.
- Full PR review-session controls beyond safe display and session ending.

## Completion Proof

This child board is complete only when the slice is merged to `main` with adversarial review findings resolved, green CI, and a receipt updating the parent conveyor queue.

## Run Command

```text
/goal Follow docs/goals/ios-web-parity-conveyor/subgoals/ios-target-aware-sessions/goal.md.
```

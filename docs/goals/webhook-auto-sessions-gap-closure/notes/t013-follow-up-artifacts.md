# T013 Follow-Up Artifact Summary

Date: 2026-05-23

Issue: https://github.com/mean-weasel/issuectl/issues/506

No new GitHub issue, PR, or issue comment was created in T013. The current
checkout contains a large uncommitted implementation stack on `main`, so posting
a completion-style issue update would overstate the repo state before the diff is
reviewed, committed, and pushed. The canonical local artifact for the remaining
issue #506 work is this note plus the GoalBuddy receipts in `state.yaml`.

## Implemented Locally

- Receiver hardening, worker scheduling, webhook diagnostics, replay/tombstone
  retention, CLI filters, and no-secret logging coverage.
- Issue auto-launch with repo/label gating, control events, per-target locking,
  launch integration, diagnostics, and kill-switch behavior.
- Completion substrate for webhook issue sessions, including structured result
  storage and idempotent notification timestamps.
- Generalized deployment target identity with `target_type` and `target_number`.
- PR review read/reservation foundation, PR safety predicates, PR context
  assembly, and deferred PR intents without terminal launch or mutation.
- Defensive credential scrubbing for webhook/comment-command terminal spawns.
- Comment command parsing and authorization foundation.
- CLI/API/dashboard/docs visibility for repo webhook flags, agents, payload mode,
  public webhook URL, retention docs, and session provenance badges.
- Atomic deployment notification claim semantics for later notification senders.

## Blocked Or Deliberately Deferred

- Daemon mutation gateway (`/api/v1/agent/mutations`) and agent CLI wrapper.
- Completion-token authenticated daemon check-ins for mutating operations.
- Action-budget enforcement for pushes, comments, labels, child issues/PRs, and
  self-trigger recursion.
- Final PR ref verification at daemon push time.
- PR terminal launch and PR auto-review enablement.
- Incremental PR review execution and PR review history/range dashboard display.
- Comment command lifecycle handlers that create/end sessions and post reactions
  or replies.
- Platform push notification transport beyond the DB claim timestamp.
- GitHub webhook creation/rotation automation.

## Owner Decisions Still Needed

- Use daemon-only mutation authority for v1, or introduce per-session GitHub App
  installation tokens?
- Should manual sessions keep ambient credentials permanently, or should users be
  able to opt into scrubbed manual sessions?
- When `auto_review_prs` is disabled, should running PR review sessions be killed
  or only should new sessions be prevented?
- What exact default budgets should apply to pushes, comments, labels, child
  artifacts, and bounded follow-up generations?
- Should fork PR auto-review remain rejected by default in v1?
- Should self-trigger fallback be exactly one bounded follow-up generation per
  review before stopping?
- What raw payload retention duration should be the default when raw storage is
  enabled?
- Should label removal kill comment-command sessions, or should only
  `/issuectl end` terminate them?

## Suggested Issue Comment After The Diff Is Pushed

```markdown
Local GoalBuddy implementation has closed the receiver hardening, issue
auto-launch, target/session substrate, PR read/reservation foundation,
credential scrubbing, comment-command parser/auth, configuration visibility,
retention docs, session provenance badges, and idempotent notification-claim
parts of #506.

Still intentionally blocked/deferred before PR auto-review execution:
daemon-mediated mutation gateway, completion-token mutation check-ins, action
budgets, final PR ref verification, PR terminal launch/auto-review enablement,
incremental review execution, comment-command lifecycle mutation/replies,
platform notification transport, and webhook creation/rotation automation.

Owner decisions still needed: daemon-only vs GitHub App credential isolation,
manual-session credential policy, running-session behavior when auto flags are
disabled, default action budgets, fork PR policy, self-trigger fallback, raw
payload retention duration, and comment-command kill-switch semantics.
```

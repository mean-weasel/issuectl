# T013 Follow-Up Artifact Summary

Date: 2026-05-23

Updated: 2026-05-24

Issue: https://github.com/mean-weasel/issuectl/issues/506

No new GitHub issue, PR, or issue comment was created in T013. The current
checkout contains a large uncommitted implementation stack on `main`, so posting
a completion-style issue update would overstate the repo state before the diff is
reviewed, committed, and pushed. The canonical local artifact for the remaining
issue #506 work is this note plus the GoalBuddy receipts in `state.yaml`.

## Implemented Locally

The original 2026-05-23 T013 note has been superseded by the
`issue-506-complete-gap-closure` GoalBuddy run. As of 2026-05-24, the local
implementation also includes:

- Immediate kill-switch behavior when repo auto-launch or auto-review flags are
  disabled through CLI, REST API, or dashboard settings.
- Bounded debounce and queue-depth intake rejection for webhook intents.
- PR-aware diagnostics, CLI `diag --pr`, manual end/liveness/reconcile PR review
  terminal handling, and PR target labels in the workbench.
- PR review launch workspaces checked out to the expected PR head ref/SHA and
  fail-closed daemon mutation handling with `unsupported_local_push` until true
  local commit upload is designed.
- `issuectl repo set <owner/repo>` with validated automation flags, agents,
  payload mode, and public webhook base URL.
- Workbench repo setup controls for webhook automation settings, webhook URL
  copy, stored webhook id status, and GitHub webhook create/secret rotation.
- Workbench overview audit trails for recent webhook events, terminal completion
  summaries, and PR review history/ranges.

- Receiver hardening, worker scheduling, webhook diagnostics, replay/tombstone
  retention, CLI filters, and no-secret logging coverage.
- Issue auto-launch with repo/label gating, control events, per-target locking,
  launch integration, diagnostics, and kill-switch behavior.
- Completion substrate for webhook issue sessions, including structured result
  storage and idempotent notification timestamps.
- Generalized deployment target identity with `target_type` and `target_number`.
- PR review read/reservation foundation, PR safety predicates, PR context
  assembly, terminal launch, incremental review execution, and fail-closed
  mutation behavior.
- Defensive credential scrubbing for webhook/comment-command terminal spawns.
- Comment command parsing and authorization foundation.
- CLI/API/dashboard/docs visibility for repo webhook flags, agents, payload mode,
  public webhook URL, retention docs, and session provenance badges.
- Atomic deployment notification claim semantics for later notification senders.

## Blocked Or Deliberately Deferred

The remaining known blocker is true daemon-mediated local commit upload for PR
review fixes. The current code verifies PR and workspace safety and then denies
push with `unsupported_local_push`; this is intentional until a daemon-owned git
object upload or git push credential model is designed and approved.

## Owner Decisions Still Needed

- Use daemon-only mutation authority for local commit upload, or introduce
  per-session GitHub App installation tokens?
- Should manual sessions keep ambient credentials permanently, or should users be
  able to opt into scrubbed manual sessions?
- What exact default budgets should apply if true local commit upload is added
  later?
- Should fork PR auto-review remain rejected by default in v1?
- Should self-trigger fallback remain exactly one bounded follow-up generation
  per review before stopping if local commit upload is enabled?
- What raw payload retention duration should be the default when raw storage is
  enabled?
- Should label removal kill comment-command sessions, or should only
  `/issuectl end` terminate them?

## Suggested Issue Comment After The Diff Is Pushed

```markdown
Local GoalBuddy implementation has closed the receiver hardening, issue
auto-launch, target/session substrate, PR lifecycle/diagnostics, PR workspace
head verification, credential scrubbing, comment-command parser/auth,
configuration visibility, dashboard webhook controls, webhook event log, PR
review range display, completion summaries, retention docs, session provenance
badges, and idempotent notification-claim parts of #506.

Still intentionally blocked before PR review push automation:
true daemon-mediated local commit upload. Current behavior verifies PR/workspace
safety and fails closed with `unsupported_local_push`.

Owner decisions still needed: daemon-only vs GitHub App credential isolation for
local commit upload, manual-session credential policy, upload-time action
budgets, fork PR policy, self-trigger fallback, raw payload retention duration,
and comment-command kill-switch semantics.
```

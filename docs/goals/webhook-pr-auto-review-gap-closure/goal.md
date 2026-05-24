# Webhook PR Auto-Review Gap Closure

## Objective

Finish the remaining issue #506 work left after
`webhook-auto-sessions-gap-closure`: daemon-mediated mutation authority,
completion-token check-ins, PR auto-review execution, incremental review,
comment-command lifecycle handlers, notification transport, webhook
management, and final disposition.

## Original Request

Make a detailed plan to address the remaining gaps using
`$goalbuddy:goal-prep`.

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainers and users of webhook-triggered issue/PR
  sessions.
- Authority: requested. Implementation authority is local and non-destructive;
  GitHub write/push behavior must remain behind explicit daemon policy and
  verification.
- Proof type: tests plus final Judge audit.
- Completion proof: a final audit maps every issue #506 remaining gap to a
  done receipt with passing verification, or to a blocked/deferred artifact
  whose owner decision is explicitly recorded.
- Goal oracle: PR auto-review cannot be called complete until webhook PR intents
  can safely launch PR-target sessions, route mutating operations through a
  daemon-enforced gateway, record completion, notify once, and pass package
  tests/typechecks/lints.
- Likely misfire: adding PR launch code or agent prompts while mutation
  authority still uses ambient credentials, lacks budgets, or bypasses final PR
  ref safety.

## Existing Plan Facts

- The prior GoalBuddy board completed receiver hardening, issue auto-launch,
  target/session substrate, PR read/reservation foundation, defensive
  credential scrubbing, comment-command parsing/auth, configuration visibility,
  retention docs, and idempotent notification claims.
- The prior final audit recorded `full_outcome_complete: false`.
- T009D was explicitly blocked on owner/security decisions.
- T013 created the local follow-up artifact:
  `docs/goals/webhook-auto-sessions-gap-closure/notes/t013-follow-up-artifacts.md`.
- Current verification after T014 passed:
  `pnpm --dir packages/core test`, `pnpm --dir packages/web test`,
  `pnpm --dir packages/cli test`, all core/web/cli typechecks and lints, and
  `git diff --check`.

## Proposed Security Defaults

The first Judge task must validate or revise these defaults before Worker work:

- v1 credential model: daemon-only GitHub mutation authority for non-manual
  sessions; no per-session GitHub App token flow in this tranche.
- Manual sessions: preserve ambient credentials by default.
- `auto_review_prs=false`: end active webhook-triggered PR review sessions for
  matching repo targets; do not kill manual sessions.
- Fork PR policy: automatic PR review remains same-repo only; fork PRs require
  manual command or a later owner-approved policy.
- Self-trigger fallback: allow at most one bounded follow-up generation after a
  daemon-authorized review push, then stop and record diagnostics.
- Comment-command kill switch: label removal does not kill comment-command
  sessions; `/issuectl end` does.
- Raw payload retention: metadata-only by default; raw mode uses a short,
  documented retention setting.

## Non-Negotiable Constraints

- Do not reintroduce ambient GitHub/SSH credentials into webhook or
  comment-command sessions.
- Do not allow agents to push, comment, label, create issues, or create PRs
  except through daemon-mediated policy.
- Do not enable PR auto-review until the mutation gateway, completion check-in,
  final ref safety, and action budgets are implemented and verified.
- Keep fork PR auto-review disabled by default.
- Every launch, mutation, completion, notification, skip, deny, and recovery
  transition must produce diagnostics.
- Use TDD for behavior changes.
- Keep files under the enforced lint max-lines limit.
- Preserve current issue auto-launch behavior and existing verified receiver
  semantics.

## Current Tranche

This board should move from security-gated PR readiness to working PR
auto-review in reversible slices:

1. Validate owner/security defaults and approve the first mutation-gateway
   slice.
2. Build the daemon mutation gateway data model and deny-by-default endpoint.
3. Add completion-token authenticated check-ins and an agent CLI wrapper.
4. Add controlled GitHub mutation adapters with budgets and final PR ref safety.
5. Enable PR target terminal launch for safe same-repo PR reviews.
6. Implement full-diff PR auto-review completion and notification.
7. Implement incremental PR review and self-trigger bounded follow-up handling.
8. Wire comment-command lifecycle handlers and reactions/replies.
9. Add webhook management and notification transport polish.
10. Run final issue #506 audit.

## Canonical Board

Machine truth lives at:

`docs/goals/webhook-pr-auto-review-gap-closure/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins.

## Run Command

```text
/goal Follow docs/goals/webhook-pr-auto-review-gap-closure/goal.md.
```

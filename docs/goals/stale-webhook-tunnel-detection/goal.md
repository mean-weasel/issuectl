# Stale Webhook Tunnel Detection

## Objective

Build product hardening so issuectl detects and explains stale webhook tunnel URLs before operators apply auto-launch or auto-review labels.

## Original Request

Plan out fixing the product gap from issue #534 with GoalBuddy: detect stale webhook tunnel URLs before label automation so users do not mistake dead GitHub delivery for broken automation.

## Intake Summary

- Input shape: `specific`
- Audience: issuectl operators manually QAing or using webhook-driven issue and PR automation
- Authority: `requested`
- Proof type: `demo`
- Completion proof: a local/manual QA walkthrough shows the UI or CLI surfaces stale webhook health before applying automation labels, points to a recovery path, and the healthy path still launches issue and PR automation correctly.
- Goal oracle: run the documented webhook QA flow with an intentionally stale quick tunnel and confirm the product identifies the stale delivery/configuration state before label automation is judged; then rotate to a fresh tunnel and confirm issue/PR automation still works.
- Likely misfire: implementing only more documentation or a passive CLI command while the label automation UI still lets users apply labels without seeing that GitHub is delivering to a dead tunnel.
- Blind spots considered: GitHub API permission limits, private test repos, tunnel providers beyond quick tunnels, UI placement near issue and PR label actions, avoiding false failures when GitHub delivery history is unavailable, and keeping Codex/Claude agent defaults independent from issue-vs-PR object type.
- Existing plan facts: issue #534 records the desired behavior and acceptance criteria; PR #535 added runbook preflight and stale quick-tunnel recovery docs; the next tranche should turn that lesson into product UI/CLI behavior.

## Goal Oracle

The oracle for this goal is:

`A manual QA walkthrough can intentionally stale the webhook tunnel, see issuectl report the stale webhook/delivery condition before or during label automation, follow a recovery path to rotate the webhook, then successfully run both issue auto-launch and PR auto-review without permission prompts.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Discover the existing webhook configuration, health, delivery, UI label-action, and CLI surfaces; implement the largest safe vertical slice that exposes stale webhook tunnel health and a recovery path; verify with targeted automated checks and the documented manual QA flow. Continue into follow-up slices until issue and PR label automation both make stale tunnel state obvious and the healthy path remains working.

## Non-Negotiable Constraints

- Preserve existing issue and PR automation semantics: Codex remains the default issue worker, Claude remains the default PR reviewer, and either agent must remain usable for either object type.
- Do not require GitHub hook admin permissions for basic product safety; when delivery history cannot be read, report that state clearly and degrade gracefully.
- Keep worktree and terminal trust bypass behavior unchanged except where the goal explicitly needs health or warning UI.
- Do not stage, revert, or rewrite unrelated dirty Apple or goal files in the local worktree.
- Follow repo diagnostics-first guidance for launch, ttyd, tmux, terminal, or workbench failures.
- Use Node 24.14.1 for issuectl CLI/server commands when native modules are involved.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, table, route, or helper. Put repeated same-shape work into one Worker package and review the package as a whole.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

Small is not the goal. Useful is the goal.

A Worker should finish the whole assigned slice. A Judge should judge the whole assigned slice. A PM should reorient the board when tasks are safe but not moving the outcome.

Tiny tasks are allowed when the failure is isolated, the risk is high, the scope is unknown, or the tiny task unlocks a larger slice. Tiny tasks are bad when they keep happening, do not change behavior, only add wrappers/contracts/proof files, or avoid the real milestone.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/stale-webhook-tunnel-detection/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/stale-webhook-tunnel-detection/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.

# iOS Workbench First-Read Architecture

## Objective

Prepare and execute an architecture tranche for iOS Today/Issues workbench-first-read consistency. Start with a Scout/Judge audit of current endpoint-specific flows, then design and implement the smallest shared store or mapping slice that avoids regressing drafts, priorities, offline state, repo filters, and issue/PR navigation.

## Why This Exists

The prior iOS parity tranche explicitly deferred Today/Issues workbench-first-read consistency because those screens are tied to endpoint-specific flows. This tranche should close that deferral carefully instead of forcing a broad rewrite.

## Current Setup Facts

- Worktree: `/Users/neonwatty/Desktop/issuectl`
- Current branch at prep time: `codex/webhook-tunnel-qa-hardening`
- The root worktree is already dirty with unrelated Apple, web, CLI, docs, and GoalBuddy artifacts. Do not revert or normalize those changes as part of this tranche.
- This is a fresh board. Do not reuse completed boards such as `ios-parity-next-tranche`, `ios-parity-hardening`, `ios-parity-followup-hardening`, `workbench`, `workbench-quality-followup`, or `completed-issue-session-ux`.

## Success Criteria

The tranche is complete only when current evidence proves:

1. A Scout receipt maps the current Today, Issues, PRs, workbench payload/store, drafts, priorities, offline queue, repo filter, and issue/PR navigation flows from the actual worktree.
2. A Judge receipt selects the smallest safe architecture slice and rejects any approach that silently rewrites or bypasses endpoint-specific behaviors.
3. The selected slice is implemented with bounded file ownership and verified by focused tests.
4. Draft creation/editing/assignment, priorities, offline queue behavior, repo filters, issue navigation, PR navigation, and existing workbench board behavior are either covered by tests or explicitly preserved with source-backed rationale.
5. The final audit maps every original risk to proof and records any follow-up architecture decisions that should remain out of scope.

## Non-Goals

- Do not rewrite the entire iOS data layer unless the Scout/Judge receipts prove no smaller slice can work.
- Do not remove existing endpoint-specific behavior merely because workbench payloads appear richer.
- Do not touch unrelated webhook, terminal, PR label, or macOS work already dirty in the root checkout.
- Do not declare completion from a narrow happy-path test that does not cover drafts, priorities, offline state, repo filters, and issue/PR navigation risks.

## Starter Command

```bash
/goal Follow docs/goals/ios-workbench-first-read-architecture/goal.md.
```

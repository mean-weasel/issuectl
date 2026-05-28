# Harden Agent CLI Runtime And Webhook QA Completion

## Objective

Make the webhook-triggered issue and PR automation path complete end to end after launch, not merely start a local session. The current tranche is to harden the spawned-agent runtime so documented `issuectl agent ...` mutation/completion commands are always available inside auto-launched sessions, then prove the fix with fresh Chrome-extension-driven webhook QA for both issue auto-launch and PR auto-review.

## Original Request

Make a detailed GoalBuddy plan for the next improvements after the Chrome webhook QA work: fix the spawned-agent runtime gap, keep tunnels disabled when not in use, and rerun end-to-end webhook QA through the Codex Chrome extension.

## Intake Summary

- Input shape: `specific`
- Audience: issuectl maintainers and future Codex agents running webhook QA.
- Authority: `requested`
- Proof type: `demo`
- Completion proof: a fresh Chrome-extension-driven webhook QA run shows issue and PR labels applied through the local UI, GitHub webhook deliveries reaching the local machine, local sessions launching, spawned agents completing with the documented `issuectl agent` commands available, UI/session/worktree/deployment state transitioning correctly, and cleanup leaving the hook disabled, tunnel stopped, and no active webhook deployments.
- Goal oracle: the final proof must demonstrate both issue auto-launch and PR auto-review from a fresh reversible test issue/PR, including successful local webhook delivery, agent mutation/completion behavior, terminal/session state, UI status transitions, and full reset.
- Likely misfire: declaring success because labels launch sessions while spawned agents still cannot run `issuectl agent mutate` or `issuectl agent complete`; leaving a tunnel or GitHub hook active after QA; or proving only the issue path while the PR review path remains untested.
- Blind spots considered: PATH differences between interactive shells and tmux-launched agents, local CLI resolution under pnpm, test repo cleanup, GitHub webhook retries, stale tunnel health, Codex Chrome extension availability, unrelated dirty worktree changes, and the risk of treating follow-up skipped intents as failures.
- Existing plan facts:
  - PR #536 merged stale webhook tunnel detection and webhook health surfacing.
  - The manual QA ladder now covers basic issue labels, PR auto-review, and full chained issue-to-PR webhook flows.
  - A Chrome-extension-driven QA pass proved webhook launch for issue `mean-weasel/issuectl-test-repo-2#45` and PR `mean-weasel/issuectl-test-repo-2#46`.
  - That pass recorded issue launch intent `78`, issue follow-up `79` skipped as opt-out, PR review intent `80`, PR review row `14`, and PR follow-up `81` skipped as opt-out.
  - The known remaining gap is that spawned agents can hit `issuectl: command not found` when following the documented agent mutation/completion instructions.
  - Webhook tunnels and GitHub hooks should be enabled only during active QA and disabled when not in use.

## Goal Oracle

The oracle for this goal is:

`A fresh Chrome-extension-driven webhook QA pass on issuectl-test-repo-2 proves issue auto-launch and PR auto-review labels applied through the local UI produce 200 webhook deliveries, exactly one local launch/review intent each, spawned agents that can run the documented agent mutation/completion commands without PATH errors, correct session/worktree/deployment and UI button/status transitions, consumed trigger labels with non-launching follow-up intents, and cleanup with hook disabled, tunnel/server stopped, and no active webhook deployments.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing focused test, or a launch-only QA pass is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`specific`

## Current Tranche

Complete the runtime hardening and final live QA loop needed to move from "webhooks can launch sessions" to "webhooks can launch sessions whose agents can finish and report state through issuectl reliably." The largest safe local package is:

1. Scout the current launched-agent command environment, generated instructions, diagnostics, tests, and QA receipts.
2. Judge the smallest deterministic design for making the issuectl CLI available to auto-launched agents.
3. Implement that design with focused tests.
4. Update QA runbooks only if the runtime or cleanup instructions need to change.
5. Run local verification.
6. Run fresh Chrome-extension webhook QA for issue and PR paths.
7. Reset the test repo hook/tunnel/local sessions.
8. Open, monitor, and merge a PR if code or docs changed.

## Non-Negotiable Constraints

- Do not revert or stage unrelated dirty Apple/client changes.
- Preserve existing issue auto-launch and PR auto-review behavior that was already proven.
- Keep the fix deterministic for spawned tmux/agent sessions, not dependent on an interactive shell profile.
- Prefer a repository-owned absolute CLI path or explicit environment variable over telling agents to guess `pnpm` incantations.
- Keep webhook tunnels and GitHub hooks off when not actively testing.
- Use diagnostics-first debugging for launch, terminal, ttyd, tmux, session, or workbench failures.
- Use the Codex Chrome extension for final live UI QA.
- Use reversible test issues/PRs and clean them up.
- Treat GitHub webhook follow-up events from label cleanup as expected only when they resolve to skipped/opt-out/non-launching states.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, launch-only QA, or a focused unit test if a safe local Worker task can move the goal closer to the oracle.

Do not stop after a single verified Worker package when the broader owner outcome still has safe local follow-up work. Advance the board to the next highest-leverage safe Worker package and continue unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not create one Worker/Judge pair per repeated file, route, helper, or QA checklist. Put repeated same-shape work into one Worker package and review the package as a whole.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice.

The first Worker should be allowed to change the launched-agent command environment and instruction text together if Scout/Judge confirm they are one behavior. A separate Worker is only needed if the QA docs or UI behavior require an independent change.

## Detailed Execution Plan

### Phase 1: Scout The Runtime And QA Evidence

Read only. Map the current runtime path before changing anything:

1. Locate where webhook auto-launch and PR auto-review sessions choose the agent command, shell, tmux environment, and generated context/instructions.
2. Locate the exact text that tells spawned agents to run `issuectl agent mutate`, `issuectl agent complete`, or related commands.
3. Identify how `pnpm --dir packages/cli exec issuectl` is available from the operator shell versus the tmux-launched agent shell.
4. Check whether an absolute CLI path, `ISSUECTL_CLI`, PATH injection, or a wrapper command already exists.
5. Identify focused tests that cover launch context, tmux command/environment generation, agent prompt text, and webhook launch/review flows.
6. Summarize the recent QA receipts: issue/PR numbers, intent IDs, review row, deployment/session IDs if available, follow-up skipped intents, and cleanup state.
7. Call out unrelated dirty files that must stay untouched.

The Scout receipt should name exact files/functions, candidate tests, and the smallest coherent Worker package.

### Phase 2: Judge The Deterministic CLI Design

Judge the Scout output and choose one design. Preferred order unless Scout finds a better local pattern:

1. Provide an explicit `ISSUECTL_CLI` environment variable to auto-launched sessions and generated agent instructions.
2. Resolve it to a deterministic workspace command or absolute executable that works under tmux without relying on shell profile PATH.
3. Update context instructions to tell agents to use `"$ISSUECTL_CLI" agent ...` or the exact selected command.
4. Keep any fallback narrow and observable, with diagnostics if command resolution fails.

Reject designs that only update docs while leaving spawned sessions unable to run the command. Reject broad launch rewrites that are not needed for the oracle.

### Phase 3: Implement Runtime Hardening

The Worker should implement the chosen design as one vertical slice:

1. Make the issuectl agent command available in the environment used by webhook-launched issue and PR sessions.
2. Update generated context/instruction text so agents invoke the deterministic command.
3. Add or update focused tests that fail when the command is absent from the launch environment or instructions.
4. Preserve existing issue and PR launch defaults.
5. Keep changed files within the Judge-approved allowlist.

Expected verification starts with focused core tests around launch context/tmux/session generation, then expands to package typecheck and lint.

### Phase 4: Update QA Runbooks If Needed

Only update Markdown QA files if implementation changes alter the operator steps, expected receipts, or cleanup:

1. Make sure the basic issue label QA includes verification that the spawned issue agent can report completion through the deterministic command.
2. Make sure the PR auto-review webhook QA includes verification that the review agent can report review/completion state through the deterministic command.
3. Make sure the full chained issue-to-PR QA includes hook/tunnel shutdown, active deployment cleanup, label cleanup, and session/worktree state checks.
4. Keep natural-language entry points clear, such as "run the basic issue label QA", "run the PR auto-review webhook QA", and "run the full chained issue-to-PR webhook QA".

### Phase 5: Local Verification

Run focused checks first, then broader checks for touched packages:

```bash
pnpm --dir packages/core test -- launch
pnpm --dir packages/core test -- github/client
pnpm --dir packages/core typecheck
pnpm --dir packages/core lint
pnpm --dir packages/web test -- webhook-health route-rendering
pnpm --dir packages/web typecheck
pnpm --dir packages/web lint
```

If docs-only changes are the only follow-up after runtime hardening, record that no web package verification was needed. If web code changes, run the relevant web tests. Before opening a PR, run the broader verification expected by `CLAUDE.md` or record why it is intentionally deferred.

### Phase 6: Fresh Chrome Webhook QA

Use the Codex Chrome extension and local UI, not only API calls:

1. Start the local web server.
2. Start a fresh tunnel only for this QA window.
3. Enable or update the GitHub webhook for the test repo to the fresh tunnel URL.
4. Verify repo webhook health in settings.
5. Create or choose a fresh reversible test issue.
6. Apply `issuectl:auto-launch` through the local UI.
7. Confirm GitHub delivery returns 200 and the local webhook event/intent records exactly one launch.
8. Confirm worktree/session/deployment state is visible in the UI.
9. Confirm the spawned issue agent can use the documented deterministic issuectl command to mutate/complete.
10. Confirm trigger label consumption and follow-up non-launching intent.
11. Create or choose a fresh reversible test PR.
12. Apply `issuectl:auto-review` through the local UI.
13. Confirm GitHub delivery returns 200 and local webhook event/intent records exactly one review launch.
14. Confirm PR review row/session/worktree/deployment state.
15. Confirm the spawned PR review agent can use the documented deterministic issuectl command to report review/completion state.
16. Confirm UI button/status transitions for active, completed, and no-duplicate-launch states.
17. Collect diagnostics:

```bash
pnpm --dir packages/cli exec issuectl diag list --limit 50
pnpm --dir packages/cli exec issuectl diag show --issue <owner>/<repo>#<issue-number>
pnpm --dir packages/cli exec issuectl diag show --issue <owner>/<repo>#<pr-number>
```

18. Reset and cleanup:
   - remove automation labels that remain,
   - close/delete temporary issue/PR/branch if created solely for QA,
   - disable the test repo webhook,
   - stop the tunnel and local server when not needed,
   - end active sessions or verify none remain,
   - verify active webhook deployments count is zero.

### Phase 7: PR, CI, Merge

If code or docs changed:

1. Commit only relevant files.
2. Open a PR with local verification and Chrome QA evidence.
3. Monitor CI.
4. Fix CI failures in the same branch.
5. Merge only after CI is green and the final QA oracle is satisfied.

If no code changes were required, record a no-code QA receipt and explain why the existing implementation satisfies the oracle.

### Phase 8: Final Audit

The final Judge/PM audit must include:

1. Changed files and reason for each.
2. Local verification commands and results.
3. Test repo, issue number, PR number, webhook delivery IDs or summaries, webhook intent IDs, deployment/session IDs, worktree paths, and review row IDs.
4. Evidence that spawned agents used the deterministic issuectl command successfully.
5. UI observations for health, label editor, active state, completion state, and duplicate launch prevention.
6. Cleanup proof: hook disabled, tunnel stopped, no active webhook deployments, labels/session state clean.
7. PR URL, CI result, and merge result if a PR was opened.
8. Explicit `full_outcome_complete: true` only if every oracle item is satisfied.

## Canonical Board

Machine truth lives at:

`docs/goals/agent-cli-runtime-webhook-qa/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/agent-cli-runtime-webhook-qa/goal.md.
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

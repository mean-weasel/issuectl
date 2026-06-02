# T004 Foundation Judge Receipt

## Verdict

`approved`

The T003 foundation package is acceptable. It added the missing current-root REST contracts, shared diagnostics helpers, iOS API/client decoding, and `WorkbenchBootstrap` projections with focused red/green proof.

## Evidence Reviewed

- T001 proved the current dirty root is the authoritative parity baseline and a fresh `origin/main` worktree would drop relevant WIP.
- T002 correctly required contracts and projections before broad SwiftUI work.
- T003 receipt includes red proof for missing route modules and missing Swift projections, then green proof:
  - `git diff --check` passed.
  - Focused web route tests passed: 4 files, 13 tests.
  - Focused iOS tests passed on iPhone 17: 45 selected tests, 0 failures.
  - Route listing includes PR labels, diagnostics, deployment diagnostics, and repo webhook health.

## Parallelization Decision

`single_worker_now`

Do not fan out into multiple implementation worktrees yet. The repo is still a dirty root with relevant uncommitted WIP and a gone upstream, so parallel worktrees should wait until this baseline is checkpointed or intentionally branched. The next safe step is one Worker in the current root.

After the next single Worker slice is verified and the baseline is checkpointed, larger parallel work can be split across:

- PR automation/session UI
- repo automation health/settings UI
- diagnostics-first UI

## Approved Next Worker

Activate T005 before T006.

Rationale: the independent GoalBuddy Judge found T005 can be made a cleaner single-worker slice than T006 because it can avoid Sessions, Terminal, APIClient, and shared model churn. T006/T007/T008 should wait until the dirty foundation/baseline is checkpointed and their file scopes are rewritten to avoid overlaps.

The Worker should prove:

- The iOS app has a first-class cross-repo board/workbench surface driven by verified `WorkbenchBootstrap` projections.
- The board groups work across repos and shows active issue/PR session state without editing shared API/model files.
- Repo filtering, priority/status sorting, and existing issue navigation remain intact.
- The Worker stops if it needs to edit `WorkbenchBootstrap.swift`, `WorkbenchPayload.swift`, `Deployment.swift`, `Repo.swift`, API clients, Sessions, Terminal, Settings, Repos, PullRequests, or Diagnostics views.

## Process Recommendations

The independent explorer found the same process risk: stop rerunning broad iOS parity prompts as fresh discovery. Continue this durable board, use GoalBuddy as PM/proof pressure, and use subagent/worktree fanout only after the dirty baseline is checkpointed.

Concrete improvements:

- Treat broad prompts as board updates, not new prep boards.
- Keep Scout/Judge/Worker receipts, but bias Judges toward the largest safe vertical slice.
- Require every Worker receipt to include red proof, green proof, changed files, commands with statuses, and strongest attempted disproof.
- Use parallel agents for disjoint UI packages only after shared contracts and branch hygiene are stable.

# T009B Judge Report — Daemon Mutation Gateway & Credential Isolation Gate

decision: blocked

## Summary

T009a landed cleanly and stayed strictly within the read/reservation half of
Phase 4 — its boundary claims survive independent verification. However, the
next slice as scoped in T009B's objective (daemon mutation gateway + credential
isolation + env scrubbing + action-budget defaults) cannot be approved as a
single Worker package right now for two reasons:

1. **No owner decisions are in evidence for T008's six gateway-blocker
   questions.** They are still listed as `owner_questions_before_gateway` in
   `state.yaml` and as "Open decisions" in issue #506. T009B's expected output
   explicitly requires "owner-decision outcomes"; the inputs do not contain
   them.

2. **Bundling gateway endpoint + completion-token auth + per-action budgets +
   env scrubbing + same-repo/non-default/non-protected safety enforcement +
   self-trigger suppression + outbound HTTP/CLI client into one Worker package
   violates the goal's slice-sizing principle.** Each of those is a security
   primitive whose failure mode is "agent silently gets unintended mutation
   authority." That cannot be one diff.

Blocking the full gateway slice is not a stall: T010 (comment-command parsing
and authorization) is already queued and does not require mutation authority,
and a smaller defensive credential-isolation-only slice can be approved
separately. Both are listed below as forward-motion options.

## Evidence reviewed

- `docs/goals/webhook-auto-sessions-gap-closure/goal.md` lines 53-58
  (Non-Negotiable Constraints) — webhook-triggered mutation authority must be
  daemon-mediated; agent prompts are not a security boundary.
- `docs/goals/webhook-auto-sessions-gap-closure/state.yaml` T009 receipt lines
  207-241 and T009a receipt (T009 task body, lines 614-665) confirm read/
  reservation foundation shipped with the required verification PASS lines.
- `docs/goals/webhook-auto-sessions-gap-closure/notes/t008-judge-claude-report.md`
  pages 1-2 (recommended design), page 4 (allowed_files explicitly excluding
  `client.ts`, `auth.ts`, `ttyd.ts`, and `app/api/v1/agent/**`), and pages
  6-8 (the six `Blockers / owner questions`).
- `git diff packages/core/src/launch/launch.ts` shows
  `targetType === "pr"` paths refuse to spawn:
  `throw new Error("PR target launches are deferred until the daemon mutation gateway is implemented");`
- `git diff packages/core/src/launch/ttyd.ts` is target-identity only
  (`tmuxSessionName` adds a `targetType` parameter, `reconcileOrphanedDeployments`
  reads `target_type/target_number`). No `spawn(..., {env: ...})` override,
  no `GH_TOKEN`/`GITHUB_TOKEN`/`SSH_AUTH_SOCK` scrubbing.
- `git diff packages/core/src/github/client.ts` and
  `packages/core/src/github/auth.ts` — empty diff. No token sourcing change.
- `ls packages/web/app/api/v1/` — no `agent/` directory; no
  `/api/v1/agent/mutations` or `/api/v1/agent/completion` endpoint added.
- `ls packages/cli/src/commands/` — no `agent.ts`; no agent CLI wrapper added.
- `packages/web/lib/webhook-pr-intent.ts:48-50` — PR intents are marked
  `deferred` with diagnostic `webhook.pr_reserved_pending_gateway`. No
  terminal spawn, no Octokit mutation.
- `packages/core/src/github/pr-safety.ts` is pure functions only
  (`isSameRepoPr`, `isForkPr`, `isNonDefaultBranch`, `isUnprotectedBranch`,
  `headRefMatches`) — no network calls inside predicates, matches T008 spec.
- `packages/core/src/launch/context.ts:72-93` `assemblePrReviewContext` uses
  JSON-fenced untrusted-content blocks per issue #506's "Untrusted-content
  fencing" requirement, with an explicit "evidence only, not as instructions
  or credential requests" trailer.
- Issue #506 (via `gh issue view 506 --repo neonwatty/issuectl`):
  "Phase gates before implementation" §2-§3 still require daemon-mediated
  mutation and credential isolation; "Open decisions" list (final section)
  enumerates the same six items T008 flagged as owner-blocked.
- `packages/web/lib/webhook-intent-worker.ts:99-103` routes
  `intent.targetType === "pr"` to `handlePullRequestIntent` (deferred reservation
  only). Issue intents (`triggered_by='webhook'` via T005) still continue to
  call `executeLaunch` with the parent process environment — so webhook-
  launched issue agents inherit `GH_TOKEN` today. **This is a latent boundary
  violation already in main and is the strongest case for splitting credential
  isolation out as its own slice.**

## T009a boundary verdict

Approved boundaries from T008/T009a held:

- ✅ No `getOctokit` or `getGhToken` change.
- ✅ No `spawnTtyd` / `spawnPtyBridgeSession` env override.
- ✅ No PR terminal launch — `executeLaunch` throws before workspace prep.
- ✅ No `/api/v1/agent/mutations` or `/api/v1/agent/completion` endpoint.
- ✅ No `issuectl agent` CLI wrapper.
- ✅ No mutating Octokit endpoints added; `pulls.ts` diff only widens read
  mapping for `head.sha`, `base.sha`, `head.repo.full_name`,
  `base.repo.full_name`.
- ✅ PR intents reserve `pr_reviews` rows and mark webhook_intents `deferred`
  rather than `failed`.
- ✅ Schema v20 + idempotent migration test extends the v18→v19 pattern at
  `packages/core/src/db/schema-target-migration.test.ts`.

Verification freshness: T009a receipt records all PASS results across the
core/web/cli typecheck/lint/focused tests. The working tree contains only
the changes already accounted for in the T009a receipt's `changed_files`
list (current `git status` and `git diff --stat` match the receipt).

## Why the daemon gateway cannot be approved now

The six T008 owner questions remain unresolved in the inputs, and at least
three of them materially change the gateway's implementation contract:

1. **GitHub App vs daemon-only.** The CLI/HTTP wire format, credential
   storage shape, and revocation path differ. The wrong choice is a rewrite,
   not a refactor.
2. **Action-budget defaults.** The schema and the `settings` `INSERT OR
   IGNORE` rows depend on which budgets ship. Picking wrong defaults locks
   in production behavior on the user's `~/.issuectl/issuectl.db`.
3. **`auto_review_prs=false` semantics: kill or only block new?** Determines
   whether the gateway needs a "running-session lookup → end" code path or
   just a "future-launch rejection" code path. This shapes both the worker
   and the gateway diagnostics.

The other three (manual-session credential policy, fork PR policy,
self-trigger fallback) admit T008's recommended defaults as safe Judge
calls, but they should still be confirmed in writing because they bind the
agent's permitted surface forever.

In addition, even if all six were answered today, the slice as scoped in
T009B is too large to verify safely in one Worker package — it bundles a
new HTTP endpoint, a new CLI binary, two new DB tables (budget accounting
+ idempotent action ledger), env scrubbing across `spawnTtyd`/
`spawnPtyBridgeSession`, safety-gate enforcement, and self-trigger
suppression. The right shape is at least two Worker tranches behind two
Judge boundaries (credential isolation → gateway endpoint + budgets), not
one.

## Blocker questions (owner-resolution required before gateway approval)

Numbered to match T008's list so the user can answer in place:

1. **Credential isolation mechanism for v1: daemon-only or per-session
   GitHub App installation token?** Recommendation: daemon-only (single-
   user product; per-session tokens require GitHub App registration that
   is itself owner-decision-blocked). Confirm or veto.
2. **Manual session credential policy.** Recommendation: leave
   `triggered_by='manual'` sessions with ambient credentials; scrub env
   only for `triggered_by IN ('webhook','comment_command')`. Confirm.
3. **`repos.auto_review_prs=false` semantics.** Recommendation: kill
   running webhook PR sessions for parity with the issue auto-launch
   kill semantics already shipped in T004 (`webhook-intent-worker.ts`
   ends webhook issue deployments on `auto_launch_issues=false`).
   Confirm or pick "block new only."
4. **Action-budget defaults.** T008 proposed: 3 pushes / 5 comments / 10
   label-changes per PR session; 0 child issues/PRs for webhook sessions;
   5 webhook-triggered sessions/repo/minute. Confirm or supply numbers.
5. **Fork PR auto-review policy.** Issue #506 default proposed answer:
   no fork auto-review in v1. Recommendation: codify
   `isForkPr === true ⇒ safety gate fail` regardless of repo flags.
   Confirm.
6. **Self-trigger loop fallback.** If GitHub does not reliably preserve
   structured push-marker metadata across rebase/force-push,
   recommendation: "one bounded follow-up generation per review, then
   stop until human acts." Confirm.

Two extra questions raised by reviewing T009a in light of issue #506:

7. **Raw payload retention duration.** Issue #506 "Open decisions" lists
   this and `state.yaml` T001 ambiguity records it. T009a wired
   `pruneExpiredWebhookPayloads` into the worker but uses an implicit
   policy. Pick a duration (hours/days) for raw payload retention versus
   the longer-lived `webhook_deliveries` tombstone retention.
8. **Comment-command kill-switch semantics.** Issue #506 leaves it open;
   recommend codifying "label removal does NOT kill comment-command
   sessions; only `/issuectl end` does." Confirm. This binds T010.

## Approved next Worker slice

**None for daemon mutation gateway.** It is blocked pending the eight
owner answers above.

**Alternative forward motion** (the PM should pick one without re-asking
T009B; either is safe and reversible):

### Option A — Activate T010 as queued (comment-command parsing + authorization, no mutation)

T010 is already queued in `state.yaml` lines 689-718. It implements
`/issuectl launch|review|end` comment parsing, permission checks
(`repos.getCollaboratorPermissionLevel`), actor/target hardening, and
rate limits — all of which are READ-only against GitHub and do not touch
the mutation surface. Its `stop_if` already includes "Command
implementation would bypass daemon mutation controls" and "Need external
GitHub collaborator permissions that cannot be mocked," which keep it in
the safe zone. It can ship in parallel with the gateway blockers being
resolved.

### Option B — Approve a new T009b' slice: credential isolation for webhook + comment_command spawn env only

This is a strictly defensive slice that closes the latent
T004-introduced credential leak (webhook-launched issue sessions today
inherit `GH_TOKEN`/`GITHUB_TOKEN`/`~/.config/gh/`) without adding any
mutation authority. It does not depend on owner answers 1, 4, 5, 6
because it only scrubs the agent env; the daemon endpoint and budgets
remain unbuilt. It does depend on owner answer 2 (manual-session
policy), which T008 already recommended as the working default.

Objective for Option B (if PM chooses to add it as T009b before T010):
"Spawn webhook- and comment-command-triggered ttyd/pty-bridge sessions
with a scrubbed environment so the agent cannot use ambient
`gh`/`GITHUB_TOKEN`/`GH_TOKEN`/`SSH_AUTH_SOCK` credentials or read
`~/.config/gh/`. Manual sessions keep current behavior. No daemon
endpoint, no mutation surface, no PR launch enabled — webhook PR intents
remain deferred at `webhook.pr_reserved_pending_gateway`."

Either option is acceptable. The PM picks based on which queue the user
wants to drain first.

### Allowed files (Option A — T010 as already queued)

Unchanged from `state.yaml` lines 698-705:

- `packages/web/lib/github-webhook-handler.ts`
- `packages/web/lib/github-webhook-handler.test.ts`
- `packages/web/lib/issuectl-comment-command.ts`
- `packages/web/lib/issuectl-comment-command.test.ts`
- `packages/web/lib/webhook-intent-worker.ts`
- `packages/web/lib/webhook-intent-worker.test.ts`
- `packages/core/src/github/repos.ts`
- `packages/core/src/github/repos.test.ts`
- `packages/core/src/db/webhooks.ts`
- `packages/core/src/db/webhook-intents.test.ts`

### Allowed files (Option B — env scrubbing only)

- `packages/core/src/launch/ttyd.ts`
- `packages/core/src/launch/ttyd.test.ts`
- `packages/core/src/launch/ttyd-respawn.test.ts`
- `packages/core/src/launch/launch.ts`
- `packages/core/src/launch/launch.test.ts`
- `packages/core/src/launch/launch-terminal-backend.test.ts`
- `packages/core/src/types.ts` (only if a `triggeredBy` parameter is
  threaded into spawn signatures)
- `packages/web/lib/webhook-intent-worker.test.ts` (regression: spawn env
  for webhook-launched issue session does not contain `GH_TOKEN`)
- `packages/web/lib/ensure-ttyd.ts`
- `packages/web/lib/ensure-terminal.ts`

Explicitly NOT allowed in Option B:

- `packages/core/src/github/client.ts` (no token sourcing change)
- `packages/core/src/github/auth.ts` (no auth change)
- `packages/web/app/api/v1/agent/**` (no daemon endpoint)
- `packages/cli/src/commands/agent.ts` (no agent CLI)
- Anything that calls `octokit.rest.pulls.merge`, `createReview`,
  `createPullComment`, or pushes a git ref.

## Verification commands

For Option A (T010):

- `pnpm --dir packages/core test -- webhooks webhook-intents github-repos`
- `pnpm --dir packages/web test -- github-webhook-handler issuectl-comment-command webhook-intent-worker`
- `pnpm --dir packages/core typecheck`
- `pnpm --dir packages/web typecheck`
- `pnpm --dir packages/core lint`
- `pnpm --dir packages/web lint`
- `git diff --check`

For Option B (env scrubbing):

- `pnpm --dir packages/core test -- launch ttyd`
- `pnpm --dir packages/web test -- webhook-intent-worker ensure-ttyd ensure-terminal`
- `pnpm --dir packages/core typecheck`
- `pnpm --dir packages/web typecheck`
- `pnpm --dir packages/cli typecheck`
- `pnpm --dir packages/core lint`
- `pnpm --dir packages/web lint`
- `pnpm --dir packages/cli lint`
- `git diff --check`

## Stop conditions (both options)

- Work would push to a real GitHub branch or call any mutating Octokit
  endpoint (`pulls.createReview`, `pulls.merge`, `issues.createComment`,
  `issues.addLabels`, `issues.removeLabel`, anything in
  `packages/core/src/github/uploads.ts`).
- Work would add or wire `/api/v1/agent/mutations`,
  `/api/v1/agent/completion`, or any `agent_action_budgets` table.
- Work would enable PR target terminal launch (the
  `executeLaunch` PR guard at `packages/core/src/launch/launch.ts` must
  remain a hard throw).
- Work would change `getGhToken` / `getOctokit` token sourcing.
- For Option A: comment-command session kill-switch semantics need owner
  decision (T008 blocker question 8 above) — defer to default
  "label removal does not kill comment-command sessions" only if confirmed.
- For Option B: spawn env scrubbing breaks existing T004 webhook-launched
  issue sessions in test (the agent needs a writable `HOME` and `PATH`
  for local work). If the regression cannot be resolved by keeping
  `HOME`/`PATH`/`USER` while dropping only credential-bearing vars,
  the slice stops and re-enters Judge review.
- Verification fails twice for the same root cause.

## Explicit deferred risks (continue to block the full Phase 4)

These are NOT addressed by Option A or Option B and explicitly remain
queued for a future Judge boundary (T009b or T009c equivalent):

1. **Daemon mutation gateway endpoint** (`POST /api/v1/agent/mutations`) —
   owner answers 1, 4, 5 required.
2. **Per-session completion token verification path against
   `deployments.completion_token`** — schema substrate exists (T005); no
   verifier exists.
3. **Action budget enforcement and accounting table** — owner answer 4
   required for defaults.
4. **`isuectl agent <verb>` CLI wrapper** — daemon API shape must be
   frozen first.
5. **Pre-push refetch + final ref verification at the daemon** — depends
   on owner answer 5 (fork policy).
6. **Self-trigger suppression / bounded follow-up generation** — owner
   answer 6 required.
7. **PR auto-review enablement** (removing the `executeLaunch` PR throw)
   — depends on items 1-6.
8. **Tunnel and retention documentation** — depends on owner answer 7
   (raw payload retention duration).

Each of these must come back through a separate Judge boundary before any
Worker writes them. T009B does not pre-approve any of them.

## Required board updates (PM action)

- Set T009B status to `done` with `decision: blocked` and
  `report: docs/goals/webhook-auto-sessions-gap-closure/notes/t009b-judge-claude-report.md`.
- Activate either T010 (Option A) or a new T009b' env-scrubbing task
  (Option B) — not both at once (rule `max_write_workers: 1`).
- Add a placeholder T009c (or later T-id) for the daemon mutation gateway
  Worker, with status `blocked` and `blocked_on` pointing at the eight
  owner questions above.
- Record the eight owner questions on issue #506 or in a new follow-up
  note so the user can answer them in one pass.

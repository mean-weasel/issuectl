# T008 Judge Report — Daemon-Mediated Mutation & Credential Isolation

decision: approved

## Summary

The mutation/credential-isolation gate can be approved with a concrete design,
but the queued T009 slice as written ("PR review state-machine foundation and
direct-push safety gates") is too broad to remain one Worker package once the
daemon-mediation contract is added. T008 approves the *design* and re-scopes
the first Worker slice to the read/reservation half (PR review state machine,
safety predicates, PR-aware launch context, webhook worker can reserve PR
intents) while explicitly forbidding any actual GitHub mutation, push, or
credential plumbing until a follow-up Judge boundary (T008b) signs off on the
daemon mutation gateway and agent environment scrubbing. Issue #506's two
hard requirements — daemon-mediated mutation and credential isolation — are
spelled out below as binding constraints on every subsequent Worker; no
Worker may push to GitHub, comment, or merge until both are in place.

## Recommended design

Two mutually reinforcing controls. Neither alone is sufficient.

### 1. Daemon-mediated mutation gateway (the only mutation path)

A new in-process HTTP/Unix-socket endpoint inside `issuectl web` becomes the
only path through which a webhook- or comment-command-launched agent can
mutate GitHub state. Concretely:

- **Endpoint surface.** `POST /api/v1/agent/mutations` plus a small CLI
  wrapper (`issuectl agent <verb> ...`) that the agent invokes from the
  workspace. The CLI/HTTP request carries `{deployment_id, completion_token,
  action_type, target, payload}`.
- **Authorization.** The server looks up the deployment row, verifies the
  `completion_token` against `deployments.completion_token` (already added
  by T005 — see `packages/core/src/db/schema.ts:52` and `types.ts:101`),
  confirms `triggered_by IN ('webhook','comment_command')`, and confirms the
  action's `(owner,repo,target_type,target_number)` matches the
  deployment's target identity (T007 columns at `schema.ts:33-35`). No token
  match → 403 + diagnostic event.
- **Action types (v1).** `push`, `pr_comment`, `pr_review_comment`,
  `pr_review`, `label_add`, `label_remove`. Explicitly **excluded** in v1:
  `merge`, `close_pr`, `create_pr`, `create_issue`. Webhook-triggered
  child-issue/child-PR budget defaults to 0.
- **Per-session and per-repo budgets.** Enforced server-side, persisted in
  a new `agent_action_budgets` table or reusing the existing
  `action_nonces` table (`schema.ts:85-93`) for accounting. Suggested
  defaults: max 3 pushes/session, max 5 comments/session, max 10
  label-changes/session, max 5 webhook-triggered sessions/repo/minute, max
  2 concurrent webhook sessions globally (matches existing
  `max_concurrent_webhook_agents` setting at `types.ts:38`).
- **PR direct-push safety predicates.** Implemented as pure functions in
  `packages/core/src/github/pr-safety.ts` (new) and called by the daemon on
  every `push` action: same-repo (`head.repo.id === base.repo.id`),
  non-default branch, non-protected branch unless explicitly overridden,
  refetched head SHA matches expected, fork PR auto-push is rejected by
  default per issue #506.
- **Self-trigger loop suppression.** The daemon tags pushes it allows with
  a marker (X-issuectl-deployment header on outbound API calls is not
  possible, but a per-review push-counter + commit metadata can be checked
  on incoming `pull_request.synchronize` events). On suppression failure,
  coalesce per the spec into one bounded follow-up generation.
- **Idempotent completion check-in.** The same gateway accepts
  `POST /api/v1/agent/completion` with `{deployment_id, completion_token,
  status, result_json}` and writes through `recordDeploymentCompletion`
  (`packages/core/src/db/deployments.ts`).
- **All actions emit diagnostics.** `webhook.mutation_allowed`,
  `webhook.mutation_denied`, `webhook.mutation_budget_exhausted`,
  `webhook.mutation_safety_gate_failed`.

### 2. Credential isolation (the agent never sees an ambient GitHub token)

Today `packages/core/src/github/client.ts:6` reads `gh auth token` and the
ttyd `spawn` call at `packages/core/src/launch/ttyd.ts:288-293` does not
pass an explicit `env:` to the child — so the tmux session and the launched
Claude/Codex process inherit the parent's full environment, including
whatever `GH_TOKEN`, `GITHUB_TOKEN`, `~/.config/gh/hosts.yml`, and SSH agent
socket the user's `issuectl web` process has. That makes the daemon gateway
ineffective: the agent could just call `gh pr merge` and bypass it.

Required:

- **Webhook- and comment-command-launched terminals must spawn with a
  scrubbed environment.** Drop `GH_TOKEN`, `GITHUB_TOKEN`, `GH_HOST`,
  `GH_CONFIG_DIR`, `SSH_AUTH_SOCK`, and unset `HOME` overlays that point at
  the user's `~/.config/gh/`. Pass explicit env via `spawn(..., {env: ...})`
  in `spawnTtyd`/`spawnPtyBridgeSession`. Manual sessions
  (`triggered_by='manual'`) keep current behavior to preserve the existing
  manual UX.
- **Git remote uses HTTPS with no credential helper.** Webhook workspaces
  configure `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` so
  the agent's `git push` fails until it goes through the daemon-mediated
  push path. The daemon performs the actual push using the ambient token
  with the safety gates from §1.
- **No PAT/App token in v1.** Issue #506 lists "daemon-mediated GitHub
  operations OR per-session least-privilege credential" as alternatives.
  Recommend daemon-only for v1 because: (a) it is a single-user product,
  (b) per-session GitHub App installation tokens require app registration
  and an installation flow that is owner-decision-blocked, (c) daemon
  mediation is strictly stronger when the daemon also strips credentials
  from the agent env. Per-session scoped tokens can be added later behind
  a setting without changing the gateway contract.

### 3. Phase 4 sequencing implication

The combined effect is that PR auto-review must land in three Worker tranches,
not one:

1. **T009a (this T008 approval):** read/reservation half — `pr_reviews`
   state machine, safety predicates as pure functions, PR-aware launch
   context, webhook worker reserves PR intents but **does not launch
   terminals for PR targets yet**. No GitHub mutation API surface added,
   no agent env changes, no daemon endpoint.
2. **T009b (requires new Judge boundary):** daemon mutation gateway
   (`/api/v1/agent/mutations`), `issuectl agent` CLI wrapper, env scrubbing
   in `spawnTtyd`/`spawnPtyBridgeSession`, action budgets table/accounting,
   self-trigger suppression. PR launch is wired but auto-push is still off
   behind a setting.
3. **T009c (separate slice):** enable PR auto-launch with the gateway live,
   write full Phase 4 end-to-end tests, document tunnel + retention.

T008's approval covers only T009a. T009b explicitly requires a fresh Judge
review because it ships new authority and a new daemon attack surface.

## Approved first Worker objective (T009a)

Implement the PR review state-machine foundation and safety predicates as a
read/reservation slice that prepares Phase 4 without enabling any GitHub
mutation, push, or PR-target terminal launch:

- Add a `pr_reviews` table (schema v20) with the columns spelled out in
  issue #506 (reserved/launching/in_progress/completed/failed/superseded
  status, reviewed-range columns, `head_repo_full_name`, `head_ref`,
  `triggered_by`, `deployment_id`, unique `(repo_id, pr_number,
  reviewed_to_sha)`).
- Add a v19→v20 migration that creates the table + the active-review index
  and includes an idempotency regression test analogous to the v18→v19 test
  at `packages/core/src/db/schema-target-migration.test.ts`.
- Add pure `packages/core/src/github/pr-safety.ts` predicates: `isSameRepoPr`,
  `isNonDefaultBranch`, `isUnprotectedBranch`, `headRefMatches`,
  `isForkPr`. All callable with a fetched `GitHubPull` and a base-repo
  identity; no network calls inside the predicates themselves.
- Extend `packages/core/src/launch/context.ts` (and a new
  `assemblePrReviewContext`) to support PR full and incremental review
  context without touching the issue context path. The PR context builder
  uses robust JSON-fenced untrusted-content blocks per issue #506's
  "Untrusted-content fencing" section.
- Allow `executeLaunch` in `packages/core/src/launch/launch.ts` to accept
  `targetType: 'pr'` with `targetNumber` instead of `issueNumber` (T007
  already made `issue_number` nullable). The function continues to refuse
  to actually launch a PR target — it returns a guarded error until T009b
  lands the daemon gateway. The new code path is exercised by tests but
  the webhook worker still short-circuits to a non-terminal "deferred"
  state for PR intents.
- Update `packages/web/lib/webhook-intent-worker.ts` so PR intents are no
  longer marked `failed` with "Unsupported target type"
  (line 106-110); instead reserve a `pr_reviews` row in `reserved` state,
  run the safety predicates, and either keep the intent `deferred` with
  diagnostic `webhook.pr_reserved_pending_gateway` (gateway not yet wired)
  or mark it `skipped_optout` with `webhook.skipped_unsafe_pr` if the
  safety gates already fail. Either way, no terminal is opened and no
  agent runs.
- Add tests across all touched files; specifically include negative tests
  proving no `executeLaunch`, no GitHub mutation, and no terminal spawn
  occur in the new PR code path.

This is the largest safe slice. It is not tiny: schema + migration + new
state-machine helpers + safety predicates + context builder + launch
flow change + worker integration + tests across all of them is a coherent
vertical slice that closes ~half of Phase 4 without crossing the
mutation/credential boundary.

## allowed_files

- packages/core/src/db/schema.ts
- packages/core/src/db/migrations.ts
- packages/core/src/db/migrations-pr-reviews.ts (new)
- packages/core/src/db/pr-reviews.ts (new)
- packages/core/src/db/pr-reviews.test.ts (new)
- packages/core/src/db/schema-invariants.test.ts
- packages/core/src/db/schema-deployments.test.ts
- packages/core/src/db/schema.test.ts
- packages/core/src/db/schema-target-migration.test.ts
- packages/core/src/types.ts
- packages/core/src/index.ts
- packages/core/src/github/pulls.ts
- packages/core/src/github/pulls.test.ts
- packages/core/src/github/pr-safety.ts (new)
- packages/core/src/github/pr-safety.test.ts (new)
- packages/core/src/launch/context.ts
- packages/core/src/launch/launch.ts
- packages/core/src/launch/launch.test.ts
- packages/core/src/launch/launch-execute-precheck.test.ts
- packages/web/lib/webhook-intent-worker.ts
- packages/web/lib/webhook-intent-worker.test.ts
- packages/web/lib/deployment-target.ts

Explicitly **NOT** allowed in T009a:

- packages/core/src/github/client.ts (no token change)
- packages/core/src/github/auth.ts (no env change)
- packages/core/src/launch/ttyd.ts (no spawn env change)
- packages/core/src/launch/launch-agent-command.ts (no agent invocation change)
- packages/web/app/api/v1/agent/** (no daemon endpoint)
- packages/cli/src/commands/agent.ts (no agent CLI wrapper)
- Any file that issues `octokit.rest.pulls.merge`, `createReview`,
  `createPullComment`, or pushes a git ref.

## verify commands

- pnpm --dir packages/core test -- schema-deployments schema-invariants schema-target-migration pr-reviews pulls pr-safety context launch deployments
- pnpm --dir packages/web test -- webhook-intent-worker launch
- pnpm --dir packages/core typecheck
- pnpm --dir packages/web typecheck
- pnpm --dir packages/cli typecheck
- pnpm --dir packages/core lint
- pnpm --dir packages/web lint
- pnpm --dir packages/cli lint
- git diff --check

## stop_if conditions

- Work would push to a real GitHub branch or call any mutating Octokit
  endpoint (`pulls.createReview`, `pulls.merge`, `issues.createComment`,
  `issues.addLabels`, `issues.removeLabel`, anything in
  `packages/core/src/github/uploads.ts`).
- Work would change the singleton `getOctokit` token source or modify
  ttyd/pty-bridge spawn `env` handling — those belong to T009b and need a
  fresh Judge review.
- Work would launch an actual terminal for a PR target via the webhook
  worker (reservation only is permitted).
- Work would add or wire the `/api/v1/agent/mutations` or
  `/api/v1/agent/completion` endpoints.
- PR auto-review would be enabled by default anywhere.
- Migration cannot preserve existing deployment, intent, and review rows;
  the v18→v19 idempotency style at
  `packages/core/src/db/schema-target-migration.test.ts` must extend to
  v19→v20.
- Verification fails twice for the same root cause.

## Blockers / owner questions

These cannot be resolved locally and must be answered before T009b can be
approved. None blocks T009a.

1. **GitHub App vs daemon-only for credential isolation.** Issue #506
   accepts either. Recommend daemon-only for v1; needs owner confirmation
   that we will *not* register a GitHub App as part of this goal.
2. **Manual session credential policy.** Recommend leaving manual sessions
   with full ambient credentials (the user is interactively driving the
   agent and intentionally accepts the risk). Confirm that only
   `triggered_by IN ('webhook','comment_command')` sessions get scrubbed
   env when T009b lands.
3. **Repo auto-flag disable semantics.** Issue #506's open decision: does
   disabling `repos.auto_review_prs` kill running PR sessions, or only
   prevent new ones? Recommendation: kill running webhook PR sessions for
   parity with auto-launch (the T004 worker already kills issue sessions
   on `auto_launch_issues=false`).
4. **Action budget defaults.** Confirm: 3 pushes / 5 comments / 10
   label-changes per PR review session; 0 child issues/PRs for webhook
   sessions; 5 webhook-triggered sessions/repo/minute. These can be put in
   the `settings` table with `INSERT OR IGNORE` defaults.
5. **Fork PR policy.** Issue #506 proposes default "no" for fork auto-review.
   Recommend codifying this as `isForkPr === true ⇒ safety gate fail`
   regardless of repo flags in v1.
6. **Self-trigger loop policy.** If suppression detection is unreliable
   (we cannot tag commits with structured metadata that GitHub preserves
   on rebase), fall back to "one bounded follow-up generation per review,
   then stop until human acts." Confirm.

## evidence

- Charter: `docs/goals/webhook-auto-sessions-gap-closure/goal.md`,
  Non-Negotiable Constraints lines 53-58 — "Webhook-triggered mutation
  authority must be daemon-mediated or otherwise least-privilege; agent
  prompts are not a security boundary."
- Board: `docs/goals/webhook-auto-sessions-gap-closure/state.yaml`, T008
  active at line 71/525-547; T007 receipt lines 474-524 confirms
  generalized deployment targets shipped with `issue_number` nullable;
  T009 currently queued lines 548-577 must be re-scoped per this report.
- Issue #506 (fetched via `gh issue view 506 --repo neonwatty/issuectl`):
  "Daemon-mediated mutation model" and "Credential isolation" phase gates
  (Phase gates §2 and §3); "Daemon-mediated agent actions" section
  enumerating minimum v1 budgets; "PR auto-review safety gates" section
  listing same-repo / non-default / non-protected / final ref check
  predicates; "Self-trigger loop prevention" section; "Open decisions"
  section listing the unresolved owner questions above.
- Ambient credential source: `packages/core/src/github/auth.ts:6-28`
  (`getGhToken` shells out to `gh auth token`),
  `packages/core/src/github/client.ts:4-32` (singleton `getOctokit`
  cached for process lifetime).
- Agent inherits parent env: `packages/core/src/launch/ttyd.ts:288-293`
  and `:341-346` — `spawn("ttyd", [...], { detached: true, stdio:
  "ignore" })` passes no `env:` override, so the child receives the
  full Next.js process environment including `GH_TOKEN`/`GITHUB_TOKEN`
  if set and access to `~/.config/gh/`.
- Webhook worker currently rejects PR targets:
  `packages/web/lib/webhook-intent-worker.ts:106-110` marks PR intents
  `failed` with "Unsupported target type" — this is the line T009a
  replaces with reservation + safety predicate evaluation.
- T005 completion-token substrate already exists:
  `packages/core/src/db/schema.ts:52-54` (`completion_token`,
  `completion_result_json`, `notification_sent_at`),
  `packages/core/src/types.ts:101-103`,
  `packages/core/src/db/deployments.ts` (`recordDeploymentCompletion`,
  `markDeploymentNotificationSent` per T005 receipt at state.yaml
  lines 337-373). The daemon mutation gateway in T009b reuses these
  fields as the agent's authorization key.
- T007 generalized deployment substrate is in place:
  `packages/core/src/db/schema.ts:33-35` (`target_type`, `target_number`),
  `packages/web/lib/deployment-target.ts:11-21`
  (`getDeploymentTarget` helper). PR-target rows can now be inserted
  without a fake `issue_number`.
- Existing mutation surfaces that must funnel through the future daemon
  gateway: `packages/core/src/github/pulls.ts:191-254` (`createReview`,
  `mergePull`, `createPullComment`),
  `packages/core/src/github/labels.ts:85-93` (`addLabels`,
  `removeLabel`).
- Existing budget/accounting precedent:
  `packages/core/src/db/schema.ts:85-96` (`action_nonces` table with
  `nonce/action_type/status/result_json`) is structurally close to what
  the daemon gateway needs — recommend extending it or modeling
  `agent_action_budgets` on it rather than introducing a wholly new
  pattern.

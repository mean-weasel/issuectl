# Webhook QA Ladder

This ladder orders issue and PR webhook QA workflows from lowest complexity to highest complexity. Use it to pick the smallest manual or agent-driven check that can answer the question in front of you.

## Natural Language Entry Points

Use these exact prompts to hand repeatable QA to a future Codex agent:

| Ask | Runbook |
| --- | --- |
| `run the basic issue label QA` | [Basic Issue Label Webhook QA](./webhook-basic-issue-label-qa.md) |
| `run the PR auto-review webhook QA` | [PR Auto-Review Webhook QA](./webhook-pr-auto-review-qa.md) |
| `run the full chained issue-to-PR webhook QA` | [Full Chained Issue-To-PR Webhook QA](./webhook-full-chained-issue-to-pr-qa.md) |

Prefer running the lower rungs first when the environment is fresh, the tunnel changed, the web server restarted, labels were reset, or a failure could be infrastructure instead of product behavior.

## Complexity Order

| Rung | Workflow | Target | What It Proves | Primary Runbook |
| --- | --- | --- | --- | --- |
| 0 | Local server health | None | Dashboard and API process are reachable on this machine. | This file |
| 1 | Webhook delivery health | Repo | GitHub can reach the local receiver and HMAC verification is working. | [Webhook Auto-Sessions Runbook](./webhook-auto-sessions.md) |
| 2 | Untagged target no-op | Issue or PR | Webhook delivery alone does not launch without the opt-in label. | [Webhook Label Manual QA](./webhook-label-manual-qa.md) |
| 3 | Label editor smoke | Issue or PR | Local UI can add/remove labels and GitHub reflects the changes. | [Webhook Label Manual QA](./webhook-label-manual-qa.md) |
| 4 | Issue auto-launch | Issue | `issuectl:auto-launch` launches exactly one Codex issue session and consumes the label. | [Basic Issue Label Webhook QA](./webhook-basic-issue-label-qa.md) |
| 5 | PR auto-review | PR | `issuectl:auto-review` launches exactly one Claude review session and consumes the label. | [PR Auto-Review Webhook QA](./webhook-pr-auto-review-qa.md) |
| 6 | Agent matrix | Issue and PR | Both Codex and Claude can start for either target without trust or permission prompts. | Future runbook |
| 7 | Completion and cleanup lifecycle | Issue and PR | Agent completion updates DB/UI state, removes active labels, and follow-up webhooks do not relaunch. | [Webhook Label Manual QA](./webhook-label-manual-qa.md) |
| 8 | Failure and reset recovery | Issue and PR | Operators can clean up stale labels, stale deployments, tmux sessions, and test branches. | [Webhook Label Manual QA](./webhook-label-manual-qa.md) |
| 9 | Full regression pass | Issue and PR | Fresh issue and fresh PR both pass the whole one-shot automation oracle in one session. | [Webhook Label Manual QA](./webhook-label-manual-qa.md) |
| 10 | Issue-to-PR review chain | Issue then PR | Issue auto-work feeds a PR that is then auto-reviewed, with current default budget limits made explicit. | [Full Chained Issue-To-PR Webhook QA](./webhook-full-chained-issue-to-pr-qa.md) |

## Rung 0: Local Server Health

Run this before debugging webhook behavior.

```bash
curl -I http://localhost:3847
pnpm --dir packages/cli exec issuectl repo show mean-weasel/issuectl-test-repo-2
sqlite3 -header -column ~/.issuectl/issuectl.db "select key,value from settings where key in ('public_webhook_base_url','webhook_debounce_seconds','max_concurrent_webhook_agents');"
```

Pass signal:

- `curl` reaches the dashboard.
- The test repo is tracked.
- Settings read without DB errors.

## Rung 1: Webhook Delivery Health

Use this when a tunnel, webhook URL, repo setup, or local server changed.

```bash
pnpm --dir packages/cli exec issuectl webhook status mean-weasel/issuectl-test-repo-2
tail -f ~/.issuectl/logs/web.log
pnpm --dir packages/cli exec issuectl webhook tail --repo mean-weasel/issuectl-test-repo-2 --limit 20

hook_id="$(sqlite3 ~/.issuectl/issuectl.db "
select webhook_id
from repos
where owner='mean-weasel' and name='issuectl-test-repo-2';")"

gh api "repos/mean-weasel/issuectl-test-repo-2/hooks/$hook_id/deliveries" \
  --jq '.[0:8][] | {event, action, status_code, delivered_at}'
```

Pass signal:

- GitHub deliveries create local webhook event rows.
- Invalid signature errors are absent for real deliveries.
- The receiver URL points at the current public tunnel.
- Recent GitHub deliveries have `status_code=200`; `502` means the tunnel or
  hook URL is stale and must be fixed before judging label automation.

## Rung 2: Untagged Target No-Op

Use this before labeling a new issue or PR. It proves opt-in is still required.

For an untagged issue or PR, wait for any create/opened delivery to debounce and resolve.

Expected status:

```text
skipped_optout
```

This is a product success, not a failure. The target should not launch until the trigger label is present.

## Rung 3: Label Editor Smoke

Use this when the question is whether the local UI can edit labels.

Steps:

1. Open the issue or PR detail page in Chrome.
2. Add a harmless non-trigger label if available, or add then remove the trigger label while automation is disabled.
3. Confirm GitHub and the local detail UI both show the same labels.

Do not use this rung with automation enabled unless you intend to launch a session.

## Rung 4: Issue Auto-Launch

Use this for the default issue path.

Expected proof:

- `issuectl:auto-launch` is added from the local issue detail UI.
- One webhook intent launches.
- Agent is `codex` unless the repo setting intentionally differs.
- Worktree path ends with `issue-<number>`.
- Codex starts without a workspace trust prompt.
- The trigger label is consumed.

## Rung 5: PR Auto-Review

Use this for the default PR path.

Expected proof:

- `issuectl:auto-review` is added from the local PR detail UI.
- One webhook intent launches.
- Agent is `claude` unless the repo setting intentionally differs.
- Worktree path ends with `pr-<number>`.
- Claude starts with bypass permissions and no interactive prompt.
- The agent uses supplied PR JSON and local checkout before `gh`.
- The trigger label is consumed.

## Rung 6: Agent Matrix

Use this only after the default issue and PR paths are healthy. This is higher complexity because it intentionally changes repo settings.

Matrix:

| Target | Agent | Expected |
| --- | --- | --- |
| Issue | Codex | Default issue path; no trust prompt. |
| Issue | Claude | Non-default issue path; no permission prompt. |
| PR | Claude | Default PR path; no permission prompt. |
| PR | Codex | Non-default PR path; no trust prompt. |

Reset repo settings after the run:

```bash
pnpm --dir packages/cli exec issuectl repo set mean-weasel/issuectl-test-repo-2 --issue-agent codex --review-agent claude
```

This deserves its own runbook when we run it more than once.

## Rung 7: Completion And Cleanup Lifecycle

Use this when the launch succeeded but UI state or labels look stale.

Expected proof:

- The agent calls `issuectl agent complete`.
- `deployments.ended_at` is set.
- `terminal_reason` is `completed`, `failed`, `no_changes`, or the expected terminal outcome.
- PR runs have a `pr_reviews` row with completed or terminal status.
- The detail UI no longer shows an active launch/open-terminal state after completion.
- The issue detail UI shows completed issue-session history and keeps new launch as a separate action.
- Retained completed tmux sessions can be viewed through a read-only completed terminal transcript.
- Follow-up cleanup webhook events resolve as `skipped_optout`.

## Rung 8: Failure And Reset Recovery

Use this when a prior QA run left stale labels, live deployment rows, terminal sessions, or open test branches.

Expected proof:

- Trigger labels are removed.
- Live deployment rows are ended through the API.
- Stale tmux sessions are killed.
- QA PRs are closed and branches deleted.
- The target can be reused or the next fresh target starts untagged.

## Rung 9: Full Regression Pass

Use this before calling a webhook-label release or major PR ready.

Run, in order:

1. Rung 0 local server health.
2. Rung 1 webhook delivery health.
3. Rung 2 untagged issue no-op.
4. Rung 4 issue auto-launch.
5. Rung 8 issue reset or closure.
6. Rung 2 untagged PR no-op.
7. Rung 5 PR auto-review.
8. Rung 7 completion and cleanup.
9. Rung 8 PR reset or closure.

Final pass criteria:

- Fresh issue and fresh PR each launch exactly once only after labeling.
- No trust or permission prompt blocks either default agent.
- Trigger labels are consumed.
- Follow-up webhook events do not relaunch.
- Diagnostics, deployment rows, and UI state agree.

## Rung 10: Issue-To-PR Review Chain

Use this after rungs 0 through 9 pass.

This rung is intentionally above the full regression pass because it crosses target boundaries and can touch mutation budgets, branch creation, PR creation, and review launch behavior.

Important default behavior:

- Webhook issue sessions currently have `create_pr=0` and `push=0` budgets.
- Therefore the default supported chained QA is staged: auto-launch the issue, then manually create a small PR, then label that PR for auto-review.
- A fully automatic issue-worker-created PR requires an explicit product/security decision to grant issue sessions PR creation and push authority.

Primary runbooks:

- [Full Chained Issue-To-PR Webhook QA](./webhook-full-chained-issue-to-pr-qa.md)
- [Webhook Issue-To-PR Review QA](./webhook-issue-to-pr-review-qa.md)

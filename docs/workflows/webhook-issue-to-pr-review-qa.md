# Webhook Issue-To-PR Review QA

This runbook covers the chained workflow:

```text
issuectl:auto-launch on an issue
  -> local issue-working session starts
  -> issue work creates or prepares a PR
  -> PR receives issuectl:auto-review
  -> local PR review session starts
```

Use this after the lower rungs in [Webhook QA Ladder](./webhook-qa-ladder.md)
pass. This workflow crosses issue automation, branch or PR creation, PR label
automation, terminal startup, label consumption, and reset cleanup.

## Natural Language Trigger

Use one of these when asking an agent to run the workflow:

```text
Run the staged webhook issue-to-PR review QA workflow.
Run the webhook issue-to-PR review chain reset.
Run the negative budget check for webhook issue PR creation.
```

The default "staged" chain means the issue session starts automatically, then a
human or supervising agent creates the small PR manually, then the PR review
session starts automatically after the PR label is added.

## Current Product Status

The full automatic chain is not enabled by default for webhook-launched issue
sessions.

Current webhook/comment-command budgets are:

| Target | `create_pr` | `push` | Meaning |
| --- | ---: | ---: | --- |
| Issue | `0` | `0` | A webhook issue worker should not create or push a PR by default. |
| PR | `0` | `1` | A PR review worker may push fixes to the reviewed PR when safety gates pass. |

Do not treat "the issue agent did not create a PR" as a product failure during
default webhook QA. Treat it as the expected security posture.

## Variants

| Variant | Complexity | What It Proves | When To Use |
| --- | --- | --- | --- |
| A. Staged chain | Medium-high | Issue auto-launch works, then a manually created PR auto-review works against the issue's output. | Current default product behavior. |
| B. Policy-enabled full chain | High | A webhook issue worker can create or push a PR and tag it for review. | Only after product/security explicitly enables issue PR creation budgets. |
| C. Negative budget check | Medium | A webhook issue worker is prevented from creating or pushing a PR by default. | Security regression checks. |

## Prerequisites

Use `issuectl-test-repo-2` unless the user explicitly asks for the primary test
repo.

```bash
OWNER=mean-weasel
REPO=issuectl-test-repo-2
BASE_URL=http://localhost:3847
```

Confirm the dashboard and repo settings:

```bash
curl -I "$BASE_URL"
pnpm --dir packages/cli exec issuectl repo show "$OWNER/$REPO"
pnpm --dir packages/cli exec issuectl webhook status "$OWNER/$REPO"
sqlite3 -header -column ~/.issuectl/issuectl.db "
select key,value
from settings
where key in (
  'public_webhook_base_url',
  'webhook_debounce_seconds',
  'max_concurrent_webhook_agents'
)
order by key;"
```

Confirm GitHub is delivering to the current tunnel before labeling anything:

```bash
hook_id="$(sqlite3 ~/.issuectl/issuectl.db "
select github_webhook_id
from repos
where owner='$OWNER' and name='$REPO';")"

pnpm --dir packages/cli exec issuectl webhook status "$OWNER/$REPO"

gh api "repos/$OWNER/$REPO/hooks/$hook_id" \
  --jq '{id, active, url: .config.url, updated_at}'

gh api "repos/$OWNER/$REPO/hooks/$hook_id/deliveries" \
  --jq '.[0:8][] | {event, action, status_code, delivered_at, redelivery}'
```

Expected normal settings:

```text
auto-launch issues: true
auto-review PRs: true
issue agent: codex
review agent: claude
```

Stop before labeling anything if:

- The local dashboard is not reachable.
- The public webhook URL is stale.
- GitHub deliveries are not reaching this machine.
- Recent GitHub deliveries show `502`; rotate the hook to a fresh tunnel first.
- The repo is not tracked or automation is disabled.
- Another webhook QA run is active for the same target.

If a quick tunnel has gone stale:

1. Start a fresh tunnel to `http://localhost:3847`.
2. Save the new base URL:

```bash
pnpm --dir packages/cli exec issuectl repo set "$OWNER/$REPO" \
  --webhook-base-url https://fresh-example.trycloudflare.com
```

3. Rotate the GitHub hook:

```bash
pnpm --dir packages/cli exec issuectl webhook rotate "$OWNER/$REPO" --yes
```

4. Generate a fresh delivery by removing and re-adding the trigger label from
   the local UI. Do not continue the chain until the relevant GitHub delivery
   has `status_code=200` and appears in `issuectl webhook tail`.

## Variant A: Staged Chain

This is the current repeatable end-to-end workflow.

### 1. Create A Fresh Untagged Issue

Create the issue from GitHub or from the local web UI. Keep it reversible.

Suggested title:

```text
QA chained issue-to-PR review receipt
```

Suggested body:

```text
Manual issuectl chained QA target. Expected behavior: adding issuectl:auto-launch starts one Codex issue session. The issue session may prepare a small receipt change, but PR creation is staged manually under current webhook budgets. The resulting PR will be labeled issuectl:auto-review for Claude review.
```

Record the issue:

```bash
ISSUE_NUMBER=<issue-number>
ISSUE_URL="$BASE_URL/issues/$OWNER/$REPO/$ISSUE_NUMBER"
```

Open `ISSUE_URL` in Chrome. Confirm the issue starts without
`issuectl:auto-launch`.

### 2. Add The Issue Trigger Label In The UI

On the issue detail page:

1. Open the label editor.
2. Add `issuectl:auto-launch`.
3. Save the labels.
4. Watch the issue transition to an active session state.
5. Open the terminal when available.

Expected UI evidence:

- The label editor shows `issuectl:auto-launch` before save.
- The label is consumed after launch.
- The launch action changes to an active terminal action while the deployment is live.
- The terminal starts without the Codex workspace trust prompt.
- After completion, the issue shows completed session history and allows a separate new launch.

Watch diagnostics:

```bash
pnpm --dir packages/cli exec issuectl diag tail --issue "$OWNER/$REPO#$ISSUE_NUMBER"
```

Confirm the intent and deployment:

```bash
sqlite3 -header -column ~/.issuectl/issuectl.db "
select i.id,i.status,i.deployment_id,i.failure_reason,
       datetime(i.first_signal_at/1000,'unixepoch') as first_signal,
       datetime(i.scheduled_at/1000,'unixepoch') as scheduled,
       datetime(i.resolved_at/1000,'unixepoch') as resolved
from webhook_intents i
join repos r on r.id=i.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and i.target_type='issue' and i.target_number=$ISSUE_NUMBER
order by i.id;"

sqlite3 -header -column ~/.issuectl/issuectl.db "
select d.id,d.target_type,d.target_number,d.agent,d.state,d.triggered_by,
       d.branch_name,d.workspace_path,d.launched_at,d.ended_at,d.terminal_reason,
       d.completion_result_json
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='issue' and d.target_number=$ISSUE_NUMBER
order by d.id;"
```

Issue pass criteria:

- Exactly one issue intent reaches `launched`.
- Follow-up label cleanup intents resolve as `skipped_optout`.
- Deployment agent is `codex` unless this run intentionally changed settings.
- Worktree path ends with `issue-<number>`.
- No trust prompt blocks the terminal.
- Final GitHub labels do not include `issuectl:auto-launch`.
- The issue session completes, or records a clear handoff if human action is required.

### 3. Create The PR Manually

Use a small receipt branch that references the issue.

```bash
tmpdir="$(mktemp -d)"
git clone "git@github.com:$OWNER/$REPO.git" "$tmpdir/$REPO"
cd "$tmpdir/$REPO"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
branch="issuectl-chain-qa-$stamp"
git switch -c "$branch"
mkdir -p qa-receipts
printf '%s\n' \
  "QA receipt for issuectl chained issue-to-PR review." \
  "Issue: #$ISSUE_NUMBER" \
  "Expected: PR receives issuectl:auto-review and launches one review session." \
  "Timestamp: $stamp" \
  > "qa-receipts/issue-to-pr-review-$stamp.txt"
git add "qa-receipts/issue-to-pr-review-$stamp.txt"
git commit -m "Add issuectl chained QA receipt"
git push -u origin "$branch"
gh pr create \
  --repo "$OWNER/$REPO" \
  --base main \
  --head "$branch" \
  --title "QA chained issue-to-PR review $stamp" \
  --body "Manual issuectl chained QA PR. Closes #$ISSUE_NUMBER. Expected behavior: adding issuectl:auto-review launches one Claude PR review session."
```

Record the PR:

```bash
PR_NUMBER=<pr-number>
PR_URL="$BASE_URL/pulls/$OWNER/$REPO/$PR_NUMBER"
```

Open `PR_URL` in Chrome. Confirm the PR starts without
`issuectl:auto-review`.

### 4. Add The PR Trigger Label In The UI

On the PR detail page:

1. Open the label editor.
2. Add `issuectl:auto-review`.
3. Save the labels.
4. Watch the PR transition to an active review session state.
5. Open the terminal when available.

Expected UI evidence:

- The PR starts untagged.
- The label editor can add `issuectl:auto-review`.
- The label is consumed after launch.
- The terminal starts without an interactive permissions or `gh auth` blocker.
- After completion, the PR detail UI no longer shows an active terminal state.

Watch diagnostics:

```bash
pnpm --dir packages/cli exec issuectl diag tail --pr "$OWNER/$REPO#$PR_NUMBER"
```

If the local CLI does not support `diag tail --pr`, use SQL:

```bash
sqlite3 -header -column ~/.issuectl/issuectl.db "
select e.id,e.event,e.level,e.source,e.target_type,e.target_number,e.deployment_id,
       e.status,e.message,datetime(e.ts/1000,'unixepoch') as ts
from diagnostic_events e
join repos r on r.id=e.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and e.target_type='pr' and e.target_number=$PR_NUMBER
order by e.id;"
```

Confirm the intent, deployment, and review row:

```bash
sqlite3 -header -column ~/.issuectl/issuectl.db "
select i.id,i.status,i.deployment_id,i.failure_reason,
       datetime(i.first_signal_at/1000,'unixepoch') as first_signal,
       datetime(i.scheduled_at/1000,'unixepoch') as scheduled,
       datetime(i.resolved_at/1000,'unixepoch') as resolved
from webhook_intents i
join repos r on r.id=i.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and i.target_type='pr' and i.target_number=$PR_NUMBER
order by i.id;"

sqlite3 -header -column ~/.issuectl/issuectl.db "
select d.id,d.target_type,d.target_number,d.agent,d.state,d.triggered_by,
       d.branch_name,d.workspace_path,d.launched_at,d.ended_at,d.terminal_reason,
       d.completion_result_json
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='pr' and d.target_number=$PR_NUMBER
order by d.id;"

sqlite3 -header -column ~/.issuectl/issuectl.db "
select pr.id,pr.pr_number,pr.deployment_id,pr.status,pr.triggered_by,
       pr.started_head_sha,pr.completed_head_sha,pr.head_ref
from pr_reviews pr
join repos r on r.id=pr.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and pr.pr_number=$PR_NUMBER
order by pr.id;"
```

PR pass criteria:

- Exactly one PR intent reaches `launched`.
- Follow-up label cleanup intents resolve as `skipped_optout`.
- Deployment agent is `claude` unless this run intentionally changed settings.
- Worktree path ends with `pr-<number>`.
- No permission prompt or `gh auth` blocker appears.
- Final GitHub labels do not include `issuectl:auto-review`.
- A `pr_reviews` row exists and reaches a terminal review status.

### 5. Capture The Chain Receipt

Record this in the task thread or a goal note:

```text
Variant: staged chain
Issue:
Issue initial labels:
Issue final labels:
Issue intent ids:
Issue deployment id:
Issue agent:
Issue worktree:
Issue completion:
Issue terminal prompt status:
PR:
PR initial labels:
PR final labels:
PR intent ids:
PR deployment id:
PR review row:
PR agent:
PR worktree:
PR terminal prompt status:
Follow-up webhook result:
Cleanup performed:
Residual risk:
```

The staged chain passes only when both targets launch exactly once, both trigger
labels are consumed, both agents start without prompts, the PR review row is
created, and cleanup returns the repo to an untagged state.

## Variant B: Policy-Enabled Full Chain

Use this only after product/security explicitly allows webhook issue sessions
to create or push PRs.

Required preconditions:

- A documented policy says issue webhook sessions may create or push a PR.
- The issue deployment receives nonzero `create_pr` and, if needed, `push` budgets.
- The daemon-mediated mutation gateway supports the exact PR creation or push path.
- The test repo and branch policy allow the operation.

Expected full-chain proof:

- The issue worker creates or pushes a branch through `issuectl agent mutate`.
- The resulting PR body links the issue with `Closes #<issue-number>`.
- The PR receives `issuectl:auto-review`.
- The PR auto-review webhook launches exactly once.
- Both trigger labels are consumed.
- Follow-up webhooks do not relaunch either target.

Stop and record a product gap if any required precondition is missing. Do not
bypass the daemon gateway with ambient `gh` credentials in a webhook-launched
session.

## Variant C: Negative Budget Check

Use this to prove default webhook issue sessions cannot create PRs.

1. Launch a fresh issue with `issuectl:auto-launch`.
2. Find the deployment id:

```bash
DEPLOYMENT_ID="$(sqlite3 ~/.issuectl/issuectl.db "
select d.id
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='issue' and d.target_number=$ISSUE_NUMBER
order by d.id desc
limit 1;")"
```

3. Confirm budgets:

```bash
sqlite3 -header -column ~/.issuectl/issuectl.db "
select action_type,limit_count,used_count
from agent_action_budgets
where deployment_id=$DEPLOYMENT_ID
order by action_type;"
```

4. Ask the issue agent to create a PR through the documented mutation gateway.

Expected result:

- `create_pr` is `0`.
- `push` is `0`.
- The daemon denies the create or push action.
- The deployment can still complete cleanly.

Pass signal:

```text
The system blocks issue-launched webhook sessions from creating or pushing PRs by default, while still allowing the staged PR auto-review flow to run when a PR is created manually.
```

## Reset

Use this reset whenever the staged chain needs to be run again.

```bash
OWNER=mean-weasel
REPO=issuectl-test-repo-2
ISSUE_NUMBER=<issue-number>
PR_NUMBER=<pr-number>

gh issue edit "$ISSUE_NUMBER" --repo "$OWNER/$REPO" \
  --remove-label "issuectl:auto-launch,issuectl:in-progress" || true

gh pr edit "$PR_NUMBER" --repo "$OWNER/$REPO" \
  --remove-label "issuectl:auto-review,issuectl:in-progress" || true

api_token="$(sqlite3 ~/.issuectl/issuectl.db "select value from settings where key='api_token';")"

issue_deployments="$(sqlite3 ~/.issuectl/issuectl.db "
select d.id
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='issue' and d.target_number=$ISSUE_NUMBER
  and d.ended_at is null;")"

for id in $issue_deployments; do
  curl -sS -X POST "http://localhost:3847/api/v1/deployments/$id/end" \
    -H "content-type: application/json" \
    -H "authorization: Bearer $api_token" \
    -d "{\"owner\":\"$OWNER\",\"repo\":\"$REPO\",\"targetType\":\"issue\",\"targetNumber\":$ISSUE_NUMBER}"
done

pr_deployments="$(sqlite3 ~/.issuectl/issuectl.db "
select d.id
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='pr' and d.target_number=$PR_NUMBER
  and d.ended_at is null;")"

for id in $pr_deployments; do
  curl -sS -X POST "http://localhost:3847/api/v1/deployments/$id/end" \
    -H "content-type: application/json" \
    -H "authorization: Bearer $api_token" \
    -d "{\"owner\":\"$OWNER\",\"repo\":\"$REPO\",\"targetType\":\"pr\",\"targetNumber\":$PR_NUMBER}"
done

tmux ls 2>/dev/null | awk -v repo="$REPO" -v num="$ISSUE_NUMBER" '$1 ~ "issuectl-" repo "-issue-" num ":" { sub(/:$/, "", $1); print $1 }' |
while read -r session; do
  tmux kill-session -t "$session"
done

tmux ls 2>/dev/null | awk -v repo="$REPO" -v num="$PR_NUMBER" '$1 ~ "issuectl-" repo "-pr-" num ":" { sub(/:$/, "", $1); print $1 }' |
while read -r session; do
  tmux kill-session -t "$session"
done

head_ref="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$REPO" --json headRefName --jq .headRefName 2>/dev/null || true)"
if [ -n "$head_ref" ]; then
  gh pr close "$PR_NUMBER" --repo "$OWNER/$REPO" --comment "Closing completed issuectl chained QA target." || true
  git ls-remote --exit-code --heads "git@github.com:$OWNER/$REPO.git" "$head_ref" >/dev/null 2>&1 &&
    git push "git@github.com:$OWNER/$REPO.git" --delete "$head_ref"
fi

gh issue close "$ISSUE_NUMBER" --repo "$OWNER/$REPO" --comment "Closing completed issuectl chained QA target." || true
```

Reset pass criteria:

- Issue trigger labels are absent.
- PR trigger labels are absent.
- No live deployment rows remain for the issue or PR.
- No matching tmux sessions remain.
- The QA PR is closed and its branch is deleted.
- The QA issue is closed or intentionally left open for another run.

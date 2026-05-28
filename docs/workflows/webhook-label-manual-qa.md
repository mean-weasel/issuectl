# Webhook Label Manual QA

This runbook is the repeatable manual QA path for label-triggered webhook sessions in the two issuectl test repositories.

Use it when you need to prove that adding an issue or PR automation label from the local web UI creates exactly one local session, starts the intended agent without a trust or permission prompt, consumes the trigger label, and leaves the target safe to test again later.

## Test Repositories

Default QA repositories:

```text
mean-weasel/issuectl-test-repo
mean-weasel/issuectl-test-repo-2
```

Prefer `issuectl-test-repo-2` for destructive-looking QA because it is the secondary fixture repo. Use reversible targets:

- Issues: a small documentation-only request that can be closed when done.
- PRs: a branch that adds one timestamped file under `qa-receipts/`.

## Labels And Defaults

| Target | Trigger label | Default agent | Expected worktree suffix |
| --- | --- | --- | --- |
| Issue | `issuectl:auto-launch` | Codex | `issue-<number>` |
| PR | `issuectl:auto-review` | Claude | `pr-<number>` |

Either target can still be launched with either agent if settings are changed. The defaults are part of the product contract, not a hard limitation.

## Prerequisites

1. Start the local web server.

```bash
pnpm --dir packages/web dev
```

2. Confirm it is reachable.

```bash
curl -I http://localhost:3847
```

3. Confirm repo automation settings.

```bash
pnpm --dir packages/cli exec issuectl repo show mean-weasel/issuectl-test-repo-2
pnpm --dir packages/cli exec issuectl webhook status mean-weasel/issuectl-test-repo-2
```

Expected settings for the normal QA pass:

```text
auto-launch issues: true
auto-review PRs: true
issue agent: codex
review agent: claude
```

4. Confirm the public webhook URL forwards to this machine and port.

```bash
pnpm --dir packages/cli exec issuectl webhook status mean-weasel/issuectl-test-repo-2
tail -f ~/.issuectl/logs/web.log
```

Stop if GitHub deliveries are not reaching the local server. Fix the tunnel or hook before making product conclusions.

## Create A Reversible Issue Target

Create an untagged issue from GitHub or from the local issuectl UI. Keep the issue simple and easy to close.

Suggested title:

```text
QA reversible issue auto-launch receipt
```

Suggested body:

```text
Manual issuectl QA target. Expected behavior: adding issuectl:auto-launch from the local issue detail UI launches one Codex session, consumes the label, and does not prompt for workspace trust.
```

Record the issue number:

```bash
ISSUE_NUMBER=<number>
OWNER=mean-weasel
REPO=issuectl-test-repo-2
```

Open the issue detail page:

```text
http://localhost:3847/issues/mean-weasel/issuectl-test-repo-2/<issue-number>
```

## Run Issue Auto-Launch QA

1. Open the issue detail page in Chrome.
2. Confirm the issue starts without `issuectl:auto-launch`.
3. Use the local label editor to add `issuectl:auto-launch`.
4. Watch diagnostics until the debounce window resolves.

```bash
pnpm --dir packages/cli exec issuectl diag tail --issue "$OWNER/$REPO#$ISSUE_NUMBER"
```

5. Confirm the intent launches once.

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
```

6. Confirm the deployment.

```bash
sqlite3 -header -column ~/.issuectl/issuectl.db "
select d.id,d.target_type,d.target_number,d.agent,d.state,d.triggered_by,
       d.branch_name,d.workspace_path,d.launched_at,d.ended_at,d.terminal_reason
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='issue' and d.target_number=$ISSUE_NUMBER
order by d.id;"
```

Expected issue evidence:

- Exactly one intent reaches `launched`.
- Follow-up label cleanup intents resolve as `skipped_optout`, not `launched`.
- Deployment agent is `codex` unless this run intentionally changed the issue agent.
- The issue detail UI changes to an active terminal state while the deployment is live.
- The terminal does not show the Codex workspace trust prompt.
- Final GitHub labels do not include `issuectl:auto-launch`.

After the agent completes:

- `deployments.ended_at` is set and `terminal_reason` records the completion outcome.
- The issue detail UI no longer shows an active terminal state.
- The issue detail UI shows a completed session record with the agent, deployment ID, branch, workspace, completion status, and summary when available.
- If the completed tmux session is retained, the `View completed terminal` action opens a read-only transcript.
- The issue detail UI still allows a separate new launch action.
- The session history action opens the filtered Sessions history for that issue.

## Create A Reversible PR Target

Create a new branch in the secondary test repo and add one receipt file.

```bash
tmpdir="$(mktemp -d)"
git clone git@github.com:mean-weasel/issuectl-test-repo-2.git "$tmpdir/issuectl-test-repo-2"
cd "$tmpdir/issuectl-test-repo-2"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
branch="issuectl-pr-manual-qa-$stamp"
git switch -c "$branch"
mkdir -p qa-receipts
printf '%s\n' \
  "QA receipt for issuectl PR auto-review." \
  "Expected review agent should use supplied PR JSON and local checkout before gh." \
  "Timestamp: $stamp" \
  > "qa-receipts/pr-auto-review-$stamp.txt"
git add "qa-receipts/pr-auto-review-$stamp.txt"
git commit -m "Add issuectl PR auto-review QA receipt"
git push -u origin "$branch"
gh pr create \
  --repo mean-weasel/issuectl-test-repo-2 \
  --base main \
  --head "$branch" \
  --title "QA PR auto-review receipt $stamp" \
  --body "Manual issuectl QA target. Expected behavior: adding issuectl:auto-review from the local PR detail UI launches one Claude review session, consumes the label, and avoids gh authentication prompts."
```

Record the PR number:

```bash
PR_NUMBER=<number>
OWNER=mean-weasel
REPO=issuectl-test-repo-2
```

Open the PR detail page:

```text
http://localhost:3847/pulls/mean-weasel/issuectl-test-repo-2/<pr-number>
```

## Run PR Auto-Review QA

1. Open the PR detail page in Chrome.
2. Confirm the PR starts without `issuectl:auto-review`.
3. Use the local label editor to add `issuectl:auto-review`.
4. Watch diagnostics until the debounce window resolves.

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

5. Confirm the intent sequence.

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
```

6. Confirm the deployment and PR review row.

```bash
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

Expected PR evidence:

- Exactly one intent reaches `launched`.
- Follow-up unlabeled events resolve as `skipped_optout`, not `launched`.
- Deployment agent is `claude` unless this run intentionally changed the review agent.
- Worktree path ends in `pr-<number>`.
- The terminal shows Claude bypass permissions and no trust prompt.
- The agent uses supplied PR JSON and local checkout before `gh`.
- Final GitHub labels do not include `issuectl:auto-review`.
- A review summary comment or review result is posted through `issuectl agent mutate`.
- The local PR detail UI no longer shows an active terminal state after completion.

## Terminal Inspection

Find the deployment id, then inspect the tmux pane. The session name normally follows:

```text
issuectl-<repo-name>-issue-<number>
issuectl-<repo-name>-pr-<number>
```

Example:

```bash
tmux capture-pane -pt issuectl-issuectl-test-repo-2-pr-$PR_NUMBER -S -220 | tail -180
```

Look for:

- `bypass permissions on` for Claude webhook/comment-command launches.
- No `Do you trust the contents of this directory?` prompt.
- No `gh auth login` blocker.
- Agent completion routed through `issuectl agent complete`.

## Reset A QA Issue

Use this when an issue QA target should be safe for another manual run.

```bash
OWNER=mean-weasel
REPO=issuectl-test-repo-2
ISSUE_NUMBER=<number>

gh issue edit "$ISSUE_NUMBER" --repo "$OWNER/$REPO" \
  --remove-label "issuectl:auto-launch,issuectl:in-progress"

api_token="$(sqlite3 ~/.issuectl/issuectl.db "select value from settings where key='api_token';")"

deployment_ids="$(sqlite3 ~/.issuectl/issuectl.db "
select d.id
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='issue' and d.target_number=$ISSUE_NUMBER
  and d.ended_at is null;")"

for id in $deployment_ids; do
  curl -sS -X POST "http://localhost:3847/api/v1/deployments/$id/end" \
    -H "content-type: application/json" \
    -H "authorization: Bearer $api_token" \
    -d "{\"owner\":\"$OWNER\",\"repo\":\"$REPO\",\"targetType\":\"issue\",\"targetNumber\":$ISSUE_NUMBER}"
done

tmux ls 2>/dev/null | awk -v repo="$REPO" -v num="$ISSUE_NUMBER" '$1 ~ "issuectl-" repo "-issue-" num ":" { sub(/:$/, "", $1); print $1 }' |
while read -r session; do
  tmux kill-session -t "$session"
done
```

Optionally close the issue after the QA pass:

```bash
gh issue close "$ISSUE_NUMBER" --repo "$OWNER/$REPO" --comment "Closing completed issuectl manual QA target."
```

## Reset A QA PR

Use this after PR auto-review QA completes.

```bash
OWNER=mean-weasel
REPO=issuectl-test-repo-2
PR_NUMBER=<number>

gh pr edit "$PR_NUMBER" --repo "$OWNER/$REPO" \
  --remove-label "issuectl:auto-review,issuectl:in-progress"

api_token="$(sqlite3 ~/.issuectl/issuectl.db "select value from settings where key='api_token';")"

deployment_ids="$(sqlite3 ~/.issuectl/issuectl.db "
select d.id
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='pr' and d.target_number=$PR_NUMBER
  and d.ended_at is null;")"

for id in $deployment_ids; do
  curl -sS -X POST "http://localhost:3847/api/v1/deployments/$id/end" \
    -H "content-type: application/json" \
    -H "authorization: Bearer $api_token" \
    -d "{\"owner\":\"$OWNER\",\"repo\":\"$REPO\",\"targetType\":\"pr\",\"targetNumber\":$PR_NUMBER}"
done

tmux ls 2>/dev/null | awk -v repo="$REPO" -v num="$PR_NUMBER" '$1 ~ "issuectl-" repo "-pr-" num ":" { sub(/:$/, "", $1); print $1 }' |
while read -r session; do
  tmux kill-session -t "$session"
done
```

Close the QA PR and delete the branch when the run is done:

```bash
head_ref="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$REPO" --json headRefName --jq .headRefName)"
gh pr close "$PR_NUMBER" --repo "$OWNER/$REPO" --comment "Closing completed issuectl manual QA target."
git ls-remote --exit-code --heads "git@github.com:$OWNER/$REPO.git" "$head_ref" >/dev/null &&
  git push "git@github.com:$OWNER/$REPO.git" --delete "$head_ref"
```

## Final QA Receipt

Record these facts in the task thread or a goal note:

```text
Target:
URL:
Initial labels:
Final labels:
Intent ids:
Deployment id:
Agent:
Worktree:
Terminal prompt status:
Completion status:
Follow-up webhook result:
Cleanup performed:
Residual risk:
```

The run passes only when the trigger label is consumed, exactly one deployment launches, no trust or permission prompt blocks the terminal, completion is recorded, and the follow-up webhook does not launch a second session.

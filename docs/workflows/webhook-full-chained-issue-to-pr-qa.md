# Full Chained Issue-To-PR Webhook QA

Use this workflow when a future agent is asked:

```text
run the full chained issue-to-PR webhook QA
run the full issue-to-PR auto-review chain
verify chained webhook behavior with the Codex Chrome extension
```

This is the highest-complexity repeatable workflow for webhook and label
automation. It uses the Codex Chrome extension as the user surface, starts with
an issue label-triggered Codex session, then creates a small PR and verifies
`issuectl:auto-review` launches a PR review session from the local UI.

Under current default budgets, the chain is staged: the issue session is
webhook-launched, but the QA runner creates the small PR manually. A fully
automatic issue-worker-created PR remains a separate product/security decision
because webhook issue sessions currently have `create_pr=0` and `push=0`.

## Scope

```bash
OWNER=mean-weasel
REPO=issuectl-test-repo-2
BASE_URL=http://localhost:3847
```

Expected defaults:

| Target | Trigger label | Agent | Worktree suffix |
| --- | --- | --- | --- |
| Issue | `issuectl:auto-launch` | `codex` | `issue-<number>` |
| PR | `issuectl:auto-review` | `claude` | `pr-<number>` |

## Agentic Browser Contract

The QA runner should use the Codex Chrome extension or Chrome automation for all
UI actions:

- Open repo settings and target detail pages in the local dashboard.
- Inspect webhook health before applying trigger labels.
- Apply `issuectl:auto-launch` and `issuectl:auto-review` through the local
  issuectl label editors.
- Observe button/status transitions after each label save.
- Capture the visible evidence in the task thread.

Shell commands are still used for setup, diagnostics, DB checks, GitHub delivery
checks, and cleanup.

## Preflight

Run these before creating targets:

```bash
curl -I "$BASE_URL"
pnpm --dir packages/cli exec issuectl repo show "$OWNER/$REPO"
pnpm --dir packages/cli exec issuectl webhook status "$OWNER/$REPO"
pnpm --dir packages/cli exec issuectl webhook tail --repo "$OWNER/$REPO" --limit 10
```

Confirm repo automation:

```text
auto-launch issues: true
auto-review PRs: true
issue agent: codex
review agent: claude
```

Check GitHub hook health:

```bash
hook_id="$(sqlite3 ~/.issuectl/issuectl.db "
select webhook_id
from repos
where owner='$OWNER' and name='$REPO';")"

gh api "repos/$OWNER/$REPO/hooks/$hook_id" \
  --jq '{id, active, url: .config.url, updated_at}'

gh api "repos/$OWNER/$REPO/hooks/$hook_id/deliveries" \
  --jq '.[0:8][] | {event, action, status_code, delivered_at, redelivery}'
```

Open repo settings in the Codex Chrome extension:

```text
http://localhost:3847/repos/mean-weasel/issuectl-test-repo-2/settings
```

Browser pass signal:

- Status and health shows webhook `ok` or an equivalent healthy state.
- Automation shows issue auto-launch and PR auto-review enabled.
- Label health reports required labels present, or `Check labels` makes it so.
- The webhook health card does not warn about a stale URL or failed latest
  delivery.

Stop before labeling if GitHub deliveries show `502`, the stored hook URL does
not match the expected issuectl receiver URL, or the UI warns that the webhook
cannot be verified. Rotate to a fresh tunnel first, then restart this workflow.

## Stage 1: Create Or Choose A Fresh Issue

Create a reversible issue in GitHub or the issuectl UI.

Suggested issue:

```text
Title: QA chained issue-to-PR webhook receipt

Body:
Manual issuectl chained QA target. Expected behavior: adding issuectl:auto-launch
from the local issuectl UI launches one Codex session and consumes the label.
The follow-up PR is created manually under current webhook budgets, then reviewed
by issuectl:auto-review.
```

Record:

```bash
ISSUE_NUMBER=<issue-number>
ISSUE_URL="$BASE_URL/issues/$OWNER/$REPO/$ISSUE_NUMBER"
```

In the Codex Chrome extension:

1. Open `ISSUE_URL`.
2. Confirm no `issuectl:auto-launch` label is present.
3. Confirm there is no active terminal/session state.
4. Confirm the issue label panel includes healthy webhook context.
5. Add `issuectl:auto-launch` through the issuectl label editor.
6. Save and observe the issue UI:
   - syncing indicator appears briefly
   - active session or terminal action appears after launch
   - trigger label is consumed
   - no workspace trust prompt blocks the terminal

Confirm webhook and diagnostics:

```bash
pnpm --dir packages/cli exec issuectl webhook tail \
  --repo "$OWNER/$REPO" \
  --target "issue#$ISSUE_NUMBER" \
  --limit 20

pnpm --dir packages/cli exec issuectl diag show \
  --issue "$OWNER/$REPO#$ISSUE_NUMBER" \
  --limit 120
```

Confirm issue deployment:

```bash
sqlite3 -header -column ~/.issuectl/issuectl.db "
select i.id,i.status,i.deployment_id,i.failure_reason,
       datetime(i.resolved_at/1000,'unixepoch') as resolved
from webhook_intents i
join repos r on r.id=i.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and i.target_type='issue' and i.target_number=$ISSUE_NUMBER
order by i.id;"

sqlite3 -header -column ~/.issuectl/issuectl.db "
select d.id,d.agent,d.state,d.triggered_by,d.branch_name,d.workspace_path,
       d.launched_at,d.ended_at,d.terminal_reason
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='issue' and d.target_number=$ISSUE_NUMBER
order by d.id;"
```

Stage 1 pass criteria:

- Exactly one issue intent reaches `launched`.
- Deployment is webhook-triggered and uses `codex`.
- Worktree path ends with `issue-$ISSUE_NUMBER`.
- UI transitions from no active session to active session/terminal, then to
  completed session history after completion.
- Final labels do not include `issuectl:auto-launch`.

## Stage 2: Create The Follow-Up PR

Create a small receipt PR that links the issue.

```bash
tmpdir="$(mktemp -d)"
git clone "git@github.com:$OWNER/$REPO.git" "$tmpdir/$REPO"
cd "$tmpdir/$REPO"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
branch="issuectl-full-chain-qa-$stamp"
git switch -c "$branch"
mkdir -p qa-receipts
printf '%s\n' \
  "QA receipt for issuectl full chained webhook QA." \
  "Issue: #$ISSUE_NUMBER" \
  "Expected: PR receives issuectl:auto-review and launches one review session." \
  "Timestamp: $stamp" \
  > "qa-receipts/full-chain-$stamp.txt"
git add "qa-receipts/full-chain-$stamp.txt"
git commit -m "Add issuectl full chain QA receipt"
git push -u origin "$branch"
gh pr create \
  --repo "$OWNER/$REPO" \
  --base main \
  --head "$branch" \
  --title "QA full chained issue-to-PR webhook $stamp" \
  --body "Manual issuectl full-chain QA PR. Closes #$ISSUE_NUMBER. Expected behavior: adding issuectl:auto-review from issuectl launches one Claude PR review session."
```

Record:

```bash
PR_NUMBER=<pr-number>
PR_URL="$BASE_URL/pulls/$OWNER/$REPO/$PR_NUMBER"
```

## Stage 3: Apply PR Auto-Review In The UI

In the Codex Chrome extension:

1. Open `PR_URL`.
2. Confirm the PR starts without `issuectl:auto-review`.
3. Confirm there is no `active review session` panel.
4. Confirm webhook health is healthy in the PR label panel.
5. Add `issuectl:auto-review` through the issuectl label editor.
6. Save and observe the PR UI:
   - syncing indicator appears briefly
   - `active review session` panel appears
   - panel shows deployment id, agent, branch, and `Open Terminal`
   - trigger label is consumed
   - terminal does not block on permissions, trust, or `gh auth`
   - after completion, the active review panel disappears and review state is
     visible in the review surfaces

Confirm webhook and diagnostics:

```bash
pnpm --dir packages/cli exec issuectl webhook tail \
  --repo "$OWNER/$REPO" \
  --target "pr#$PR_NUMBER" \
  --limit 20

pnpm --dir packages/cli exec issuectl diag show \
  --pr "$OWNER/$REPO#$PR_NUMBER" \
  --limit 120
```

Confirm PR deployment and review row:

```bash
sqlite3 -header -column ~/.issuectl/issuectl.db "
select i.id,i.status,i.deployment_id,i.failure_reason,
       datetime(i.resolved_at/1000,'unixepoch') as resolved
from webhook_intents i
join repos r on r.id=i.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and i.target_type='pr' and i.target_number=$PR_NUMBER
order by i.id;"

sqlite3 -header -column ~/.issuectl/issuectl.db "
select d.id,d.agent,d.state,d.triggered_by,d.branch_name,d.workspace_path,
       d.launched_at,d.ended_at,d.terminal_reason,d.completion_result_json
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

Stage 3 pass criteria:

- Exactly one PR intent reaches `launched`.
- Deployment is webhook-triggered and uses `claude`.
- Worktree path ends with `pr-$PR_NUMBER`.
- A `pr_reviews` row links to the deployment.
- Final labels do not include `issuectl:auto-review`.
- Follow-up unlabeled deliveries resolve as `skipped_optout` and do not relaunch.

## Final Chain Pass Criteria

The chained workflow passes only when all of these are true:

- Repo settings and target label panels showed healthy webhook state before
  automation labels were applied.
- Both automation labels were applied through the local issuectl UI using the
  Codex Chrome extension or Chrome automation.
- GitHub delivered both labeled webhooks to this machine with `status_code=200`.
- Local webhook tail shows both labeled events.
- Diagnostics show normal launch lifecycles for both targets.
- Issue session and PR review session each launch exactly once.
- Both worktree paths and deployment rows match their target numbers.
- UI button/status transitions were observed for issue and PR detail pages.
- Both trigger labels were consumed.
- Cleanup leaves no live deployment rows, matching tmux sessions, or QA branch.

## Reset And Cleanup

```bash
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
  curl -sS -X POST "$BASE_URL/api/v1/deployments/$id/end" \
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
  curl -sS -X POST "$BASE_URL/api/v1/deployments/$id/end" \
    -H "content-type: application/json" \
    -H "authorization: Bearer $api_token" \
    -d "{\"owner\":\"$OWNER\",\"repo\":\"$REPO\",\"targetType\":\"pr\",\"targetNumber\":$PR_NUMBER}"
done

tmux ls 2>/dev/null | awk -v repo="$REPO" -v num="$ISSUE_NUMBER" '$1 ~ "issuectl-" repo "-" num ":" { sub(/:$/, "", $1); print $1 }' |
while read -r session; do
  tmux kill-session -t "$session"
done

tmux ls 2>/dev/null | awk -v repo="$REPO" -v num="$PR_NUMBER" '$1 ~ "issuectl-" repo "-pr-" num ":" { sub(/:$/, "", $1); print $1 }' |
while read -r session; do
  tmux kill-session -t "$session"
done

head_ref="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$REPO" --json headRefName --jq .headRefName 2>/dev/null || true)"
if [ -n "$head_ref" ]; then
  gh pr close "$PR_NUMBER" --repo "$OWNER/$REPO" \
    --comment "Closing completed issuectl full chained webhook QA target." || true

  # Keep the head branch around until the close/unlabel webhook finishes
  # debouncing. Deleting it immediately can turn cleanup webhooks into
  # branch-not-found diagnostics.
  debounce_seconds="$(sqlite3 ~/.issuectl/issuectl.db "select coalesce(value, '60') from settings where key='webhook_debounce_seconds';")"
  sleep "$(( ${debounce_seconds:-60} + 15 ))"

  git ls-remote --exit-code --heads "git@github.com:$OWNER/$REPO.git" "$head_ref" >/dev/null 2>&1 &&
    git push "git@github.com:$OWNER/$REPO.git" --delete "$head_ref"
fi

gh issue close "$ISSUE_NUMBER" --repo "$OWNER/$REPO" \
  --comment "Closing completed issuectl full chained webhook QA target." || true
```

Cleanup pass criteria:

- Issue trigger labels are absent.
- PR trigger labels are absent.
- No live deployment rows remain for the issue or PR.
- No matching tmux sessions remain.
- The QA PR is closed and its branch is deleted.
- The QA issue is closed or intentionally left open for another run.

## Receipt

Record this in the task thread:

```text
Workflow: full chained issue-to-PR webhook QA
Repo settings webhook health:
Issue:
Issue UI transition:
Issue GitHub delivery:
Issue webhook event id:
Issue intent ids:
Issue deployment id:
Issue worktree:
Issue terminal prompt status:
PR:
PR UI transition:
PR GitHub delivery:
PR webhook event id:
PR intent ids:
PR deployment id:
PR review row:
PR worktree:
PR terminal prompt status:
Cleanup:
Residual risk:
```

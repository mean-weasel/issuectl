# PR Auto-Review Webhook QA

Use this workflow when a future agent is asked:

```text
run the PR auto-review webhook QA
run the PR label QA
verify issuectl:auto-review from the UI
```

This workflow proves the local dashboard can apply `issuectl:auto-review`, the
GitHub webhook delivery reaches this machine, issuectl creates exactly one PR
review session, the trigger label is consumed, the review deployment and
`pr_reviews` row agree, and the PR detail UI reflects the active review state.

## Scope

Target repository:

```bash
OWNER=mean-weasel
REPO=issuectl-test-repo-2
BASE_URL=http://localhost:3847
```

Default expectations:

| Item | Expected value |
| --- | --- |
| Trigger label | `issuectl:auto-review` |
| Agent | `claude` |
| Worktree suffix | `pr-<number>` |
| Trigger source | Local issuectl PR detail label editor |
| UI surface | Codex Chrome extension or Chrome attached to the local dashboard |

## Preflight

Run these before creating or labeling a PR:

```bash
curl -I "$BASE_URL"
pnpm --dir packages/cli exec issuectl repo show "$OWNER/$REPO"
pnpm --dir packages/cli exec issuectl webhook status "$OWNER/$REPO"
```

Confirm the repo settings show:

```text
auto-review PRs: true
review agent: claude
```

Check the webhook URL and recent deliveries:

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

Pass signal:

- The dashboard responds on `localhost:3847`.
- The repo is tracked and PR auto-review is enabled.
- The repo settings page or CLI/GitHub checks show healthy webhook delivery.
- Recent GitHub delivery status is `200`. If it is `502`, rotate the webhook
  to a fresh tunnel before continuing.

## Create Or Choose The PR

Prefer a fresh PR that only adds a receipt file.

```bash
tmpdir="$(mktemp -d)"
git clone "git@github.com:$OWNER/$REPO.git" "$tmpdir/$REPO"
cd "$tmpdir/$REPO"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
branch="issuectl-pr-auto-review-qa-$stamp"
git switch -c "$branch"
mkdir -p qa-receipts
printf '%s\n' \
  "QA receipt for issuectl PR auto-review." \
  "Expected: adding issuectl:auto-review from issuectl launches one review session." \
  "Timestamp: $stamp" \
  > "qa-receipts/pr-auto-review-$stamp.txt"
git add "qa-receipts/pr-auto-review-$stamp.txt"
git commit -m "Add issuectl PR auto-review QA receipt"
git push -u origin "$branch"
gh pr create \
  --repo "$OWNER/$REPO" \
  --base main \
  --head "$branch" \
  --title "QA PR auto-review receipt $stamp" \
  --body "Manual issuectl QA target. Expected behavior: adding issuectl:auto-review from the local PR detail UI launches one Claude review session, consumes the label, and avoids interactive prompts."
```

Record:

```bash
PR_NUMBER=<pr-number>
PR_URL="$BASE_URL/pulls/$OWNER/$REPO/$PR_NUMBER"
```

## Browser Steps

Use the Codex Chrome extension or Chrome browser automation to drive the local
dashboard:

1. Open `PR_URL`.
2. Verify the PR label panel is visible and the PR does not already have
   `issuectl:auto-review`.
3. Verify there is no `active review session` panel yet.
4. Open the label editor and add `issuectl:auto-review`.
5. Confirm any webhook health warning is absent or explains a known healthy
   state.
6. Save the label change.
7. Observe the PR detail UI transition:
   - label syncing indicator appears briefly
   - `issuectl:auto-review` is removed after the launch is accepted
   - the `active review session` panel appears while the deployment is live
   - the panel shows deployment id, agent, branch, and `Open Terminal` when the
     terminal is available
   - after completion, the active panel disappears and review status is visible
     through the PR review/history surfaces

Do not add the label in GitHub directly for this workflow. The point is to test
the issuectl PR label editor plus webhook automation.

## Confirm Webhook Delivery

```bash
pnpm --dir packages/cli exec issuectl webhook tail \
  --repo "$OWNER/$REPO" \
  --target "pr#$PR_NUMBER" \
  --limit 20

pnpm --dir packages/cli exec issuectl diag tail \
  --pr "$OWNER/$REPO#$PR_NUMBER" \
  --limit 100
```

Confirm GitHub delivery:

```bash
gh api "repos/$OWNER/$REPO/hooks/$hook_id/deliveries" \
  --jq '
    [.[] | select(.event == "pull_request" and .action == "labeled")]
    | .[0:5]
    | .[] | {event, action, status_code, delivered_at, redelivery}
  '
```

Pass signal:

- A local webhook event exists for `pull_request.labeled` on the target PR.
- The matching GitHub delivery has `status_code=200`.
- Diagnostics show the launch lifecycle in order: `launch.requested`,
  `workspace.prepared`, `deployment.recorded`, terminal spawn, and
  `deployment.activated`.

## Confirm Intent, Deployment, And Review State

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

Pass criteria:

- Exactly one PR intent reaches `launched`.
- Any follow-up unlabeled delivery caused by consuming the trigger label
  resolves as `skipped_optout`.
- Deployment `triggered_by` is `webhook`.
- Deployment `agent` is `claude`.
- `workspace_path` ends with `pr-$PR_NUMBER`.
- A `pr_reviews` row exists for the PR and links to the deployment.
- No permission prompt, workspace trust prompt, or `gh auth login` blocker
  appears in the terminal.
- GitHub labels no longer include `issuectl:auto-review`.

## Confirm Agent Command Availability

Use the live terminal transcript or completed terminal transcript to confirm the
spawned review agent received deterministic issuectl controls:

- `ISSUECTL_CLI` is present and points at an executable issuectl command.
- `ISSUECTL_SERVER_URL` points at the local dashboard URL used for this run.
- The agent uses `"$ISSUECTL_CLI" agent complete ...` for its final check-in.
- The terminal does not show `issuectl: command not found`.
- `completion_result_json` is populated on the deployment.
- The linked `pr_reviews` row moves out of an active state after completion.

## Reset And Cleanup

```bash
gh pr edit "$PR_NUMBER" --repo "$OWNER/$REPO" \
  --remove-label "issuectl:auto-review,issuectl:in-progress" || true

api_token="$(sqlite3 ~/.issuectl/issuectl.db "select value from settings where key='api_token';")"

deployment_ids="$(sqlite3 ~/.issuectl/issuectl.db "
select d.id
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='pr' and d.target_number=$PR_NUMBER
  and d.ended_at is null;")"

for id in $deployment_ids; do
  curl -sS -X POST "$BASE_URL/api/v1/deployments/$id/end" \
    -H "content-type: application/json" \
    -H "authorization: Bearer $api_token" \
    -d "{\"owner\":\"$OWNER\",\"repo\":\"$REPO\",\"targetType\":\"pr\",\"targetNumber\":$PR_NUMBER}"
done

tmux ls 2>/dev/null | awk -v repo="$REPO" -v num="$PR_NUMBER" '$1 ~ "issuectl-" repo "-pr-" num ":" { sub(/:$/, "", $1); print $1 }' |
while read -r session; do
  tmux kill-session -t "$session"
done

head_ref="$(gh pr view "$PR_NUMBER" --repo "$OWNER/$REPO" --json headRefName --jq .headRefName 2>/dev/null || true)"
if [ -n "$head_ref" ]; then
  gh pr close "$PR_NUMBER" --repo "$OWNER/$REPO" \
    --comment "Closing completed issuectl PR auto-review QA target." || true
  git ls-remote --exit-code --heads "git@github.com:$OWNER/$REPO.git" "$head_ref" >/dev/null 2>&1 &&
    git push "git@github.com:$OWNER/$REPO.git" --delete "$head_ref"
fi

if [ -n "${hook_id:-}" ]; then
  gh api -X PATCH "repos/$OWNER/$REPO/hooks/$hook_id" -F active=false >/dev/null || true
fi

sqlite3 -header -column ~/.issuectl/issuectl.db "
select count(*) as live_webhook_deployments
from deployments
where triggered_by='webhook' and ended_at is null;"
```

## Receipt

Record this in the task thread:

```text
Workflow: PR auto-review webhook QA
PR:
Initial labels:
Final labels:
GitHub delivery:
Webhook event id:
Intent ids:
Deployment id:
Review row:
Agent:
Worktree:
UI transition:
Terminal prompt status:
ISSUECTL_CLI evidence:
Completion/review status:
Cleanup:
Residual risk:
```

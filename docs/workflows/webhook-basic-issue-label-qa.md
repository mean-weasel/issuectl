# Basic Issue Label Webhook QA

Use this workflow when a future agent is asked:

```text
run the basic issue label QA
run the issue auto-launch webhook QA
verify issuectl:auto-launch from the UI
```

This is the smallest repeatable end-to-end check for issue label automation. It
proves the local dashboard can apply `issuectl:auto-launch`, GitHub can deliver
the resulting webhook to this machine, issuectl creates exactly one Codex issue
session, the trigger label is consumed, and the issue detail UI moves through
the expected states.

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
| Trigger label | `issuectl:auto-launch` |
| Agent | `codex` |
| Worktree suffix | `issue-<number>` |
| Trigger source | Local issuectl issue detail label editor |
| UI surface | Codex Chrome extension or Chrome attached to the local dashboard |

## Preflight

Run these before touching labels. Stop if any check fails.

```bash
curl -I "$BASE_URL"
pnpm --dir packages/cli exec issuectl repo show "$OWNER/$REPO"
pnpm --dir packages/cli exec issuectl webhook status "$OWNER/$REPO"
pnpm --dir packages/cli exec issuectl webhook tail --repo "$OWNER/$REPO" --limit 10
```

Confirm the repo settings show:

```text
auto-launch issues: true
issue agent: codex
```

Confirm webhook health in GitHub and issuectl:

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
- The repo is tracked and issue auto-launch is enabled.
- The repo settings page shows webhook health as healthy, or the CLI/GitHub
  checks prove the latest visible delivery is healthy.
- Recent GitHub delivery status is `200`. If it is `502`, rotate the webhook
  to a fresh tunnel before continuing.

## Create Or Choose The Issue

Prefer a fresh issue in `issuectl-test-repo-2`.

Suggested issue:

```text
Title: QA basic issue label receipt

Body:
Manual issuectl QA target. Expected behavior: adding issuectl:auto-launch from
the local issue detail UI launches one Codex session, consumes the label, and
does not prompt for workspace trust.
```

Record:

```bash
ISSUE_NUMBER=<issue-number>
ISSUE_URL="$BASE_URL/issues/$OWNER/$REPO/$ISSUE_NUMBER"
```

## Browser Steps

Use the Codex Chrome extension or Chrome browser automation to drive the local
dashboard as a user would:

1. Open `ISSUE_URL`.
2. Verify the label panel is visible and the issue does not already have
   `issuectl:auto-launch`.
3. Verify the page does not show an active terminal/session state yet.
4. Open the label editor and add `issuectl:auto-launch`.
5. Confirm any webhook health warning is absent or explains a known healthy
   state.
6. Save the label change.
7. Observe the issue detail UI transition:
   - label syncing indicator appears briefly
   - `issuectl:auto-launch` is removed after the launch is accepted
   - the issue shows an active session or terminal action while the deployment
     is live
   - after completion, the issue shows completed session history and allows a
     separate new launch

Do not add the label in GitHub directly for this workflow. The point is to test
the issuectl label editor plus webhook automation.

## Confirm Webhook Delivery

Watch local intake and diagnostics:

```bash
pnpm --dir packages/cli exec issuectl webhook tail \
  --repo "$OWNER/$REPO" \
  --target "issue#$ISSUE_NUMBER" \
  --limit 20

pnpm --dir packages/cli exec issuectl diag tail \
  --issue "$OWNER/$REPO#$ISSUE_NUMBER" \
  --limit 80
```

Confirm GitHub delivery:

```bash
gh api "repos/$OWNER/$REPO/hooks/$hook_id/deliveries" \
  --jq '
    [.[] | select(.event == "issues" and .action == "labeled")]
    | .[0:5]
    | .[] | {event, action, status_code, delivered_at, redelivery}
  '
```

Pass signal:

- A local webhook event exists for `issues.labeled` on the target issue.
- The matching GitHub delivery has `status_code=200`.
- Diagnostics show the launch lifecycle in order: `launch.requested`,
  `workspace.prepared`, `deployment.recorded`, terminal spawn, and
  `deployment.activated`.

## Confirm Intent And Deployment State

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
       d.branch_name,d.workspace_path,d.launched_at,d.ended_at,d.terminal_reason
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='issue' and d.target_number=$ISSUE_NUMBER
order by d.id;"
```

Pass criteria:

- Exactly one intent reaches `launched`.
- Any follow-up unlabeled delivery caused by consuming the trigger label
  resolves as `skipped_optout`.
- Deployment `triggered_by` is `webhook`.
- Deployment `agent` is `codex`.
- `workspace_path` ends with `issue-$ISSUE_NUMBER`.
- No `reconcile.tmux_missing`, `liveness.tmux_missing`, or
  `ensure_ttyd.failed` diagnostic appears before the UI can attach.
- GitHub labels no longer include `issuectl:auto-launch`.

## Reset And Cleanup

Use this even after a passing run so the target can be reused safely.

```bash
gh issue edit "$ISSUE_NUMBER" --repo "$OWNER/$REPO" \
  --remove-label "issuectl:auto-launch,issuectl:in-progress" || true

api_token="$(sqlite3 ~/.issuectl/issuectl.db "select value from settings where key='api_token';")"

deployment_ids="$(sqlite3 ~/.issuectl/issuectl.db "
select d.id
from deployments d
join repos r on r.id=d.repo_id
where r.owner='$OWNER' and r.name='$REPO'
  and d.target_type='issue' and d.target_number=$ISSUE_NUMBER
  and d.ended_at is null;")"

for id in $deployment_ids; do
  curl -sS -X POST "$BASE_URL/api/v1/deployments/$id/end" \
    -H "content-type: application/json" \
    -H "authorization: Bearer $api_token" \
    -d "{\"owner\":\"$OWNER\",\"repo\":\"$REPO\",\"targetType\":\"issue\",\"targetNumber\":$ISSUE_NUMBER}"
done

tmux ls 2>/dev/null | awk -v repo="$REPO" -v num="$ISSUE_NUMBER" '$1 ~ "issuectl-" repo "-" num ":" { sub(/:$/, "", $1); print $1 }' |
while read -r session; do
  tmux kill-session -t "$session"
done
```

Optional:

```bash
gh issue close "$ISSUE_NUMBER" --repo "$OWNER/$REPO" \
  --comment "Closing completed issuectl basic issue label QA target." || true
```

## Receipt

Record this in the task thread:

```text
Workflow: basic issue label QA
Issue:
Initial labels:
Final labels:
GitHub delivery:
Webhook event id:
Intent ids:
Deployment id:
Agent:
Worktree:
UI transition:
Terminal prompt status:
Completion status:
Cleanup:
Residual risk:
```

# T005 Manual QA Receipt

## Target

`mean-weasel/issuectl-test-repo-2#35`

## Browser Evidence

Opened:

```text
http://localhost:3847/issues/mean-weasel/issuectl-test-repo-2/35
```

Observed with Playwright:

- Completed session card rendered for deployment `#151`.
- Card showed `CODEX WORKED THIS ISSUE`, `Completed session #151`, `No Changes`, branch/workspace details, and the completion summary.
- `Launch with Codex` button count was `1`, proving a new launch remains a separate action.
- `Open Terminal` button count was `0`, proving the ended deployment is not presented as live.
- `View completed terminal` opened a read-only transcript dialog for `issuectl-issuectl-test-repo-2-35`.
- The transcript included the completion text from the retained tmux pane.
- `Session history` linked to `/sessions?tab=sessions&repo=mean-weasel%2Fissuectl-test-repo-2&state=ended&q=Issue+%2335`.

Screenshot:

```text
/tmp/issuectl-completed-session-issue-35.png
/tmp/issuectl-completed-terminal-issue-35.png
```

## DB Evidence

Deployment row for issue #35:

```text
id=151
target_type=issue
target_number=35
agent=codex
triggered_by=webhook
ended_at=2026-05-28 11:10:05
terminal_reason=completed
completion_result_json={"status":"no_changes","summary":"Verified issue #35 auto-launch session context and clean worktree; no code changes were requested."}
```

## Diagnostics Evidence

`issuectl diag show --issue mean-weasel/issuectl-test-repo-2#35` showed:

- `deployment.recorded` and `deployment.activated` for deployment `151`.
- `codex.trust.recorded` before terminal activation.
- `webhook.auto_launch_label_consumed`.
- `agent.completion_recorded` with status `no_changes`.
- `lifecycle.in_progress_label_removed`.

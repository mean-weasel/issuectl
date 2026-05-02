# Launching Issues with Codex

issuectl can launch an issue into either Claude Code or Codex from the web dashboard or the iOS app. The selected agent receives the issue context that issuectl builds for the launch, including the issue body, selected comments, referenced files, and branch/workspace information.

## Requirements

- `issuectl web` is running on the machine that owns the worktree.
- `ttyd` and `tmux` are installed on that machine.
- The `codex` CLI is installed and available on the `PATH` used by `issuectl web`.

## Web Setup

1. Open the web dashboard.
2. Go to Settings.
3. Set the default launch agent to `Codex`.
4. Set Codex extra args if desired.
5. Save settings.

Example Codex extra args:

```text
--sandbox danger-full-access --ask-for-approval never
```

You can also leave Codex extra args empty and let the local Codex CLI use its defaults.

## iOS Setup

1. Connect the iOS app to the same `issuectl web` server.
2. Open Settings.
3. Set Launch Agent to `Codex`.
4. Set Codex Extra Args if desired.
5. Save settings.

The iOS app stores these settings through the same server settings API as the web dashboard.

## Per-Launch Agent Selection

The default launch agent comes from the `launch_agent` setting, but each launch flow can still choose the agent for that session. Use this when most sessions should launch with one agent but a specific issue should use the other.

## Settings Keys

issuectl stores launch-agent settings in the local SQLite settings table:

| Key | Values | Purpose |
| --- | --- | --- |
| `launch_agent` | `claude` or `codex` | Default agent for new launches. |
| `claude_extra_args` | CLI args string | Extra args appended after `claude`. |
| `codex_extra_args` | CLI args string | Extra args appended after `codex`. |

Saved args are parsed and validated before they are stored or used in a launch.

## Recommended Codex Configurations

Leave Codex extra args empty to use the local Codex CLI defaults.

Use full-access Codex launches:

```text
--sandbox danger-full-access --ask-for-approval never
```

Use a specific model:

```text
--model <model-name>
```

Combine flags as needed:

```text
--model <model-name> --sandbox danger-full-access --ask-for-approval never
```

## What Launch Does

For a Codex launch, issuectl:

1. Builds the issue context.
2. Prepares the selected worktree and branch.
3. Creates a deployment record with `agent = codex`.
4. Starts a `tmux` session through `ttyd`.
5. Runs `codex` with the saved Codex extra args and passes the generated issue context to the session.

Claude launches continue to use `claude_extra_args`; Codex launches use `codex_extra_args`. The two settings do not affect each other.

## Troubleshooting

If the terminal opens and exits immediately, verify that `codex` works from the same shell environment used to start `issuectl web`.

If saving settings fails, remove shell control operators such as `;`, `&&`, pipes, redirects, command substitution, or unbalanced quotes from the extra args field.

If the iOS app does not show updated settings, reconnect to the server or reopen Settings to refresh the server-provided values.

# issuectl

> **Terminal launch prerequisites.** Local launch sessions require `ttyd` and `tmux` on the machine running `issuectl web`.

Cross-repo GitHub issue command center with Claude Code and Codex launch integration.

## Setup

```bash
pnpm install
pnpm turbo build
issuectl init        # First-time setup (creates DB)
issuectl web         # Start dashboard and print iOS setup link/QR
```

## What it does

issuectl tracks GitHub issues across multiple repos and launches agent sessions with full issue context — comments, referenced files, and branch setup — in a single click from the web dashboard or iOS app.

## Launch agents

issuectl can launch issues with either Claude Code or Codex. Choose a default agent in Settings, or select an agent per launch from the web and iOS launch flows.

Agent-specific CLI flags are saved independently as `claude_extra_args` and `codex_extra_args`. See [Launching Issues with Codex](docs/workflows/launching-with-codex.md) for setup examples.

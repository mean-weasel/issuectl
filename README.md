# issuectl

> **macOS + Ghostty only.** This tool currently requires macOS and the [Ghostty](https://ghostty.org) terminal emulator. Linux and other terminals are not yet supported.

Cross-repo GitHub issue command center with Claude Code launch integration.

## Setup

```bash
pnpm install
pnpm turbo build
issuectl init        # First-time setup (creates DB)
issuectl web         # Start dashboard (localhost:3847)
```

## What it does

issuectl tracks GitHub issues across multiple repos and launches Claude Code sessions with full issue context — comments, referenced files, and branch setup — in a single click from the web dashboard.

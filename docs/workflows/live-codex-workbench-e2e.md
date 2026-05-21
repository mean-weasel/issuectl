# Live Codex Workbench E2E

`packages/web/e2e/codex-workbench-live.spec.ts` covers the real workbench launch path with GitHub, Codex, ttyd, tmux, and the custom `packages/web/server.ts` terminal proxy.

It is skipped by default. To run it intentionally:

```sh
ISSUECTL_LIVE_CODEX_WORKBENCH_E2E=1 \
ISSUECTL_LIVE_CODEX_WORKBENCH_REPO=mean-weasel/issuectl-test-repo-2 \
pnpm --dir packages/web test:e2e:live-codex-workbench
```

Allowed repositories are only:

- `mean-weasel/issuectl-test-repo`
- `mean-weasel/issuectl-test-repo-2`

The test creates uniquely marked issues, launches one with Codex, verifies the terminal remains reachable after navigating to another issue and returning, ends the session, and closes the marked issues. It refuses non-allowlisted repositories before side effects and performs best-effort cleanup for deployments, ttyd/tmux, issues, the dev server, and temporary worktrees.

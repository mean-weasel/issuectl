# T015 Repo Setup and Settings Mode

Result: done

Implemented `/workbench/settings` and `/workbench/settings?repoSetup=1` as collapsed-side-pane workbench surfaces.

## Changed Files

- `packages/web/components/workbench/RepoSetupFocus.tsx`
- `packages/web/components/workbench/SettingsFocus.tsx`
- `packages/web/components/workbench/WorkbenchShell.tsx`
- `packages/web/e2e/workbench.spec.ts`

## Summary

Added focused workbench settings and repo setup surfaces. Settings mode loads and saves editable settings, shows health, current user, and tracked repo count, and keeps the URL at `/workbench/settings` after save. Repo setup supports local path and branch pattern edits, GitHub repo picker refresh, adding a selected repo, and confirmed repo removal. Empty repo actions continue to route to repo setup/settings.

## Verification

Passed:

```sh
pnpm --filter @issuectl/web test:e2e -- e2e/workbench.spec.ts --project=desktop-chromium
pnpm --filter @issuectl/web typecheck
```

Playwright result: 19 tests passed on `desktop-chromium`.

## Acceptance Evidence

- Settings mode hides `Active sessions` and `Repo issues`.
- Settings form is visible with health summary.
- `GET /api/v1/settings`, `GET /api/v1/health`, and `GET /api/v1/user` are called with bearer auth.
- `PATCH /api/v1/settings` sends editable launch/cache/worktree/agent/idle settings.
- Successful save renders `Settings saved`, keeps `/workbench/settings`, and leaves side panes collapsed.
- Repo setup opens from repo overview at `/workbench/settings?repoSetup=1`.
- `GET /api/v1/repos/github?refresh=true` powers picker refresh.
- `PATCH /api/v1/repos/mean-weasel/web` sends local path and branch pattern.
- `DELETE /api/v1/repos/mean-weasel/web` is called only after confirming `Remove mean-weasel/web?`.
- `POST /api/v1/repos` sends `{ "owner": "mean-weasel", "name": "web" }` for the picker add path.

Full outcome complete: false.

Next task: T016.

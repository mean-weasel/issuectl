# T003 Workbench Aggregate API Receipt

## Result

Done.

## Changed Files

- `packages/web/app/api/v1/workbench/route.ts`
- `packages/web/app/api/v1/workbench/route.test.ts`
- `packages/web/components/workbench/workbench-types.ts`

## Route Response Sample

The route test fixture returns this representative contract:

```json
{
  "repos": [
    {
      "id": 1,
      "owner": "neonwatty",
      "name": "issuectl",
      "badgeCount": 3,
      "deployedCount": 3,
      "issueError": null,
      "issuesFromCache": true,
      "issuesCachedAt": "2026-05-16T16:00:00.000Z",
      "deployments": [
        { "id": 101, "issueNumber": 12, "ttydPort": 7701, "state": "active" },
        { "id": 102, "issueNumber": 14, "ttydPort": 7702, "state": "active" },
        { "id": 103, "issueNumber": 16, "ttydPort": 7703, "state": "active" }
      ],
      "previews": {
        "7703": { "status": "error", "lines": ["error preview"] }
      },
      "issues": [
        { "number": 12, "priority": "high", "hasActiveDeployment": true },
        { "number": 14, "priority": "normal", "hasActiveDeployment": true },
        { "number": 16, "priority": "low", "hasActiveDeployment": true },
        { "number": 18, "priority": "normal", "hasActiveDeployment": false }
      ]
    },
    { "id": 4, "owner": "neonwatty", "name": "web", "issues": [] }
  ],
  "deployments": [
    { "id": 101, "issueNumber": 12, "state": "active" },
    { "id": 102, "issueNumber": 14, "state": "active" },
    { "id": 103, "issueNumber": 16, "state": "active" },
    { "id": 201, "issueNumber": 22, "state": "active" }
  ],
  "previews": {
    "7703": { "status": "error", "lines": ["error preview"] }
  },
  "settings": {
    "branch_pattern": "issue-{number}-{slug}",
    "launch_agent": "codex",
    "codex_extra_args": "--sandbox danger-full-access"
  },
  "health": { "ok": true, "error": null },
  "user": { "login": "jeremy", "error": null }
}
```

## Acceptance Evidence

- Exports `WorkbenchRepo`, `WorkbenchDeployment`, `WorkbenchIssueSummary`, `WorkbenchPreview`, and `WorkbenchPayload`.
- Requires API auth before touching the DB.
- Aggregates repos, active deployments, previews, issues, priorities, settings, health, and user in one payload.
- Excludes pending and ended deployments from aggregate arrays and repo badge counts.
- Continues with partial per-repo data when issue fetching fails, setting `issueError` on the affected repo.
- Does not call PR list/detail APIs during initial aggregate assembly.
- Does not include named-shell or fake plain-shell data.

## Verification

- `pnpm --filter @issuectl/core build` passed.
- `pnpm --filter @issuectl/web test -- app/api/v1/workbench/route.test.ts` passed: 1 file, 3 tests.
- `pnpm --filter @issuectl/web typecheck` passed.

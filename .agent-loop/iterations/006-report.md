# Iteration 6

## Summary

Cached the v1 API bearer token in packages/web/lib/api-auth.ts so iOS polling and parallel API calls do not hit SQLite settings on every authenticated route. Added resetApiTokenCache plus a unit test asserting repeated validation only calls getSetting once.

## Verification

Attempted pnpm vitest run packages/web/lib/api-auth.test.ts, but this fresh worktree has no installed vitest binary (ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command vitest not found).

## Process Learning Reflection

- Local-only:
- Candidate skill learning:
- Candidate repo change:
- Upstream review proposed:

## Judge Decision

List row lookup costs are reduced, but derived collections still recompute frequently; local server/API connection and server-side payload audit remain requested by the user.

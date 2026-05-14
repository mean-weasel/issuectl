# T003 Judge Receipt: PR #423 Review

## Decision

Changes required before merge readiness.

PR #423 is a good draft slice and the local build/unit validation is strong enough to continue, but it is not merge-ready against the Phase 1 acceptance criteria yet.

## Findings

1. Missing HTTP assertion coverage for repo settings endpoints.
   - Phase 1 requires mock-server or HTTP assertions for repo list, browse, add, update, and remove endpoints.
   - The implementation uses shared APIs, but existing `IssueCTLTests` do not assert `addRepo`, `githubRepos`, `updateRepo`, or `removeRepo` method/path/body behavior.

2. UI automation evidence is incomplete.
   - `IssueCTLMacUITests` was attempted and interrupted after about 60 seconds with no test output.
   - This matches the known Mac accessory/menu-bar automation instability, but the PR still needs either a deterministic replacement test or an explicit dogfood result before merge.

3. PR has no GitHub checks configured.
   - `gh pr checks 423` reports no checks on the branch.
   - Local validation can substitute only if the receipt stays explicit about the absence of CI.

## Approved Follow-Up Worker

Add shared API HTTP assertion tests for:

- `POST /api/v1/repos` body and success response.
- `GET /api/v1/repos/github` and `GET /api/v1/repos/github?refresh=true`.
- `PATCH /api/v1/repos/:owner/:name` body and response.
- `DELETE /api/v1/repos/:owner/:name` success and failure behavior.

After that, rerun focused tests and update PR #423.

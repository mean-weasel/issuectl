# T034 Phase 6D Parse Decision

Date: 2026-05-14

Result: done

Decision: implement_slice

## Evidence

- iOS already implements a complete parse flow in `apple/IssueCTL/Views/Issues/ParseView.swift`.
- The review row component in `apple/IssueCTL/Views/Issues/ParseResultRow.swift` is straightforward: parsed title/body/type/clarity/labels, accept/reject toggle, and repo picker.
- Shared API support already exists in `apple/IssueCTLShared/Services/APIClient+ListEnhancements.swift`:
  - `parseNaturalLanguage(input:)` posts to `/api/v1/parse` with a long timeout.
  - `batchCreateIssues(issues:)` posts reviewed issues to `/api/v1/parse/create`.
- The Phase 6 parity plan requires either implementation or an intentional deferral with issue link. There is no current backend/API blocker requiring deferral.

## Decision

Implement a Mac Phase 6D parse/batch creation slice in a child PR into `mac-sidebar-spaces-option-a`.

## Worker Slice

Add a Mac parse sheet reachable from the Mac issue/draft creation surface, with:

- input step with text editor, 8192 character cap, parse progress, repo-load error handling, and parse failure preservation;
- review step with parsed issue rows, accept/reject controls, repo assignment for each accepted row, parsed labels/type/clarity display, and create button gating;
- result step summarizing created/drafted/failed items;
- deterministic Mac UI fixture endpoints for parse and batch create;
- unit/UI tests for parse decision state and the fixture-backed Mac parse workflow.

## Validation

Use the same replacement gate as prior child PRs unless GitHub checks appear:

- `git diff --check`
- Mac build
- `IssueCTLMacTests`
- targeted or full `MacSidebarSmokeTests`
- targeted iOS `APIClientExtensionTests`
- `pnpm typecheck`
- `pnpm lint`

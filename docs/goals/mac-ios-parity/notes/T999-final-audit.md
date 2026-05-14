# T999 Final Mac iOS Parity Audit

Date: 2026-05-14

## Decision

Decision: `complete`

Full outcome complete: `true`

## Scope Audited

- Source plan: `docs/specs/2026-05-14-mac-ios-parity-plan.md`
- Integration branch: `mac-sidebar-spaces-option-a`
- Final integration commit at audit time: `1036836`
- Open child PRs targeting the integration branch: none
- Board state: all required implementation/review tasks are done; historical blocked T011 was superseded by T013/T014 before Phase 1 merged.

## Evidence Map

- Phase 1 Repository Management: PR #423 merged; native Mac repo add/browse/edit/remove, filter reconciliation, HTTP assertions, and Mac UI evidence recorded in T013/T014.
- Phase 2 Connection and Settings Hub: PR #424 merged; server status, reconnect/disconnect/manual credentials, auto-connect preservation, advanced settings, and settings UI coverage recorded in T015/T016.
- Phase 3 Worktrees: PR #425 merged; active/stale worktrees, cleanup one/all, failure handling, and Mac settings coverage recorded in T017/T018.
- Phase 4 Issue List: PR #426 merged; sections, search, repo filters, mine, sort, reset, counts, pagination, cache state, and per-Desktop persistence recorded in T019/T020.
- Phase 5 Issue Detail Actions: PRs #427-#431 merged; core detail actions, labels/assignees/reassign, image attachments/lightbox, linked context, and detail UI/API coverage recorded in T021-T030.
- Phase 6 Draft/Create/Parse: PRs #432-#433 merged; draft assignment, labels, direct create, image attachments, AI parse/review/batch create, and fixture-backed UI/API coverage recorded in T031-T038.
- Phase 7 Pull Requests: PRs #434-#436 merged; PR browse/detail, comments/reviews/merge actions, linked issue/PR navigation, and deterministic UI/API coverage recorded in T039-T045.
- Phase 8 Launch/Terminal/Sessions: PRs #437-#440 merged; launch options, active-session filters/previews/polling, readiness/dirty-worktree handling, embedded terminal window, reconnect/respawn/text size/end-session controls recorded in T046-T057.
- Phase 9 Offline/Cache: PRs #441-#443 merged; offline/cached banners, issue/detail cache age, offline queue foundation, replay/control hardening, and replacement dogfood evidence recorded in T058-T064.
- Phase 10 Notifications: issue #444 created and PR #445 merged; real macOS push registration explicitly deferred with Mac settings copy and tests proving no broken toggles are exposed, recorded in T065-T067.
- Phase 11 Today/Attention: PR #446 merged; compact Mac Today sidebar surface with metrics, attention rows, search, quick navigation, quick create, and cache/offline state recorded in T068-T070.

## Validation Receipts

Every implementation PR recorded local validation and a merge gate. GitHub reported no child-PR status checks for the recent parity slices, so local replacement validation was recorded before merges. The final recent validation includes:

- `git diff --check`
- `pnpm typecheck`
- `pnpm lint` with existing warnings only
- `IssueCTLMac` build
- `IssueCTLMacTests/MacIssueFilterStateTests`: 29 tests passed
- Focused Today UI tests: 2 tests passed

## Residual Follow-Up

- Real macOS push notification registration is intentionally deferred to https://github.com/mean-weasel/issuectl/issues/444. This is outside the completed parity plan because Phase 10 selected and implemented the explicit iOS-only/deferred Mac copy path.

## Result

The Mac app parity plan has been executed through PR-sized slices, each merged into `mac-sidebar-spaces-option-a` with recorded validation. No required worker remains queued or active, no child PR remains open, and no required discrepancy from the plan remains unhandled within the selected Phase 10 notification decision.

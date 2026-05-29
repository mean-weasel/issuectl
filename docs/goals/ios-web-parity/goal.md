# iOS Web Parity

## Objective

Execute the iOS web workbench and automation parity plan in `docs/superpowers/plans/2026-05-28-ios-web-parity.md` through successive verified slices until the iOS app reflects the current web app's cross-repo workbench, board, target-aware issue/PR sessions, webhook automation settings, and automation-label workflows.

## Original Request

"Now I want to return in a fresh work tree to make sure that we keep the iOS app up to date with these changes since now it does not reflect that work. Can you do a deep analysis of the current state of the web app, those web hooks, our new dashboard interface for seeing all issues at once, et cetera, et cetera? Let's make a detailed plan to get the iOS app up to date with what's going on in the web app."

Follow-up: use GoalBuddy prep to implement the fixes in a consistent measurable way.

## Intake Summary

- Input shape: `existing_plan`
- Audience: issuectl maintainers and iOS users
- Authority: `requested`
- Proof type: `test`
- Completion proof: the iOS app can use the current workbench data model, shows a native Board surface for all tracked repo issues, handles issue and PR sessions distinctly, exposes repo webhook automation settings, supports issue auto-launch and PR auto-review label workflows, and passes focused web/core/iOS validation with a final simulator QA note.
- Goal oracle: run the board through the final task's verification matrix and confirm every acceptance criterion in `docs/superpowers/plans/2026-05-28-ios-web-parity.md` is either implemented and verified or explicitly deferred by a Judge receipt.
- Likely misfire: implementing a cosmetic iOS board while leaving the data contract, PR session target handling, webhook health, and automation-label flows stale.
- Blind spots considered: dirty active checkout vs clean fresh worktree drift, missing REST endpoints for mobile-only automation flows, expensive webhook health checks, XcodeGen churn, existing in-flight Apple target-aware changes, UI test reliability, and the risk of stopping after only the first model/API slice.
- Existing plan facts: `docs/superpowers/plans/2026-05-28-ios-web-parity.md` is the source implementation plan; this board turns that plan into measurable GoalBuddy tasks.

## Goal Kind

`existing_plan`

## Current Tranche

Start by reconciling the fresh worktree with the active dirty checkout and validating which web/core/apple changes already exist. Then implement the largest safe vertical slices in this order unless a Judge receipt selects a safer prerequisite:

1. Shared Swift contracts, API client support, and mock server coverage for `/api/v1/workbench`, repo automation fields, target-aware deployments, webhook health, and PR label support.
2. Native iOS Board tab and `WorkbenchStore`.
3. Active session parity for issue and PR sessions.
4. Repo automation settings, webhook health, and label health controls.
5. Issue auto-launch and PR auto-review label UX.
6. Final docs, focused tests, and simulator QA.

## Non-Negotiable Constraints

- Use the fresh main-based checkout at `/Users/neonwatty/Desktop/issuectl/.worktrees/ios-web-parity-main` unless a PM receipt records a different worktree.
- Do not overwrite or revert unrelated user changes from the active checkout.
- Reconcile uncommitted active-checkout changes before implementing overlapping Apple or web files.
- Keep work in bounded, reviewable slices with explicit verification.
- Use existing IssueCTL SwiftUI, APIClient, test, and mock-server patterns.
- Use `/api/v1/workbench` as the mobile summary source of truth unless a Judge receipt proves a better contract.
- Keep detail screens backed by existing issue and PR detail endpoints.
- Fetch expensive webhook health on demand for selected repos unless a Judge approves aggregate health in workbench payload.
- Add REST endpoints only when iOS needs them and no equivalent mobile-usable route exists.
- Prefer `xcodebuildmcp` for iOS simulator build/run/test when available; shell `xcodebuild` fallback is acceptable.
- If adding Swift files requires project regeneration, run XcodeGen and avoid committing accidental version-file churn.
- Use `rg` for source search and `apply_patch` for manual edits.

## Stop Rule

Stop only when a final Judge or PM audit maps receipts back to the original owner outcome and records `full_outcome_complete: true`.

Do not stop after planning, discovery, or the first verified implementation package while safe local follow-up work remains.

If a slice needs owner input, credentials, production access, destructive action, or policy decisions, mark that exact slice blocked, create a safe local follow-up, and keep advancing non-blocked local work.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

Prefer vertical slices that produce real iOS behavior and tests. Avoid one task per enum, route, helper, or view unless the risk is genuinely isolated. If two tiny tasks happen in a row, the PM or Judge must re-bundle the next task into a larger useful slice.

## Canonical Board

Machine truth lives at:

`docs/goals/ios-web-parity/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/ios-web-parity/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake, likely misfire, blind spots, and goal oracle.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. Advance to the next largest safe useful slice unless blocked or at a required Judge boundary.
10. Finish only with final audit proof that every acceptance criterion is implemented, verified, or explicitly deferred.

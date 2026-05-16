# Mac UX Cleanup

## Objective

Improve the IssueCTL native Mac app so the sidebar, menu bar popup, and panel behavior feel simpler, more discoverable, and more Mac-native while preserving the existing dogfood workflows.

## Original Request

The user asked to clean up the mac UX after noticing opportunities such as making sidebar filters collapsible, then asked for three independent UX auditing agents to inspect the sidebar and menu bar popup. After reviewing the audits, the user asked to prepare this work with GoalBuddy.

## Current Tranche

Execute a whole-Mac UX cleanup pass based on the three-agent audit and prior board work. The pass includes sidebar filter and information-architecture cleanup, menu bar popup restructuring, safer header chrome, empty/recovery states, collapsed rail status, terminology consistency, and panel/window behavior where it directly improves the menu-bar utility feel.

## Intake Summary

- Input shape: `audit` with an existing board to reuse and repair.
- Audience: IssueCTL maintainers and Mac app dogfood users.
- Authority: `requested`.
- Proof type: `test` and `review`.
- Completion proof: required UX cleanup slices are implemented, focused Mac build/tests pass or have recorded local replacement evidence, and a final audit maps completed receipts back to the latest UX findings with `full_outcome_complete: true`.
- Likely misfire: shipping visual churn or a broad rewrite while leaving the main workflow problems intact: heavy sidebar chrome, duplicate Drafts IA, passive count chips, inconsistent filter disclosure, menu-bar actions that feel like window management, and risky header controls.
- Blind spots considered: existing local work and receipts, the active manual dogfood blocker, macOS Spaces behavior, menu-bar accessory expectations, UI automation reliability, panel activation/titlebar risk, and high text scale/min-width density.

## Audit Findings To Address

- Sidebar filters should keep search visible and collapse secondary controls into a compact filter surface.
- Issue and PR count chips should be clearly actionable or visually demoted.
- Drafts should not appear both as a top-level section and as an Issues state.
- Issues, PRs, and Sessions should share disclosure styling, persistence behavior, and collapsed defaults.
- Empty filtered states should offer direct recovery actions such as Reset Filters, Select All Repos, or Clear Search.
- The sidebar header should not place rare/risky Disconnect next to frequent controls.
- The menu bar popup should expose useful app actions/status before desktop layout controls.
- Current desktop wording should be user-facing and consistent with settings.
- Collapsed rail should show useful attention/session/offline state, not only icons.
- Panel/window behavior may be adjusted when it improves the Mac menu-bar utility feel without destabilizing Spaces support.

## Existing Board Facts

The reused board already recorded completed work for prior slices:

- T001 validated the original board and chose sidebar filter simplification first.
- T002 simplified Issues and PR filter sections.
- T003 standardized pagination behavior.
- T004 simplified some sidebar chrome.
- T005 cleaned up status-menu desktop wording.
- T006 implemented additional per-desktop PR/Sessions persistence but is blocked on a manual two-desktop dogfood receipt.

The next `/goal` run must preserve those receipts, resolve or route around the T006 blocker, and then continue with the largest safe remaining UX slice.

## Non-Goals

- Do not redesign backend APIs unless a task proves the Mac UX cannot be improved safely without API support.
- Do not remove current workflows: issue triage, PR triage, draft creation, parse creation, sessions, worktrees, offline queue, per-desktop filters, local auto-connect, and settings access must continue to work.
- Do not rewrite the whole Mac app or broad settings architecture in one unreviewable change.
- Do not make panel/window behavior changes unless they directly support the menu-bar utility UX and can be verified.
- Do not treat planning, audits, or screenshots alone as completion for this execution tranche.

## Verification Baseline

Each Worker task should choose the smallest sufficient subset, but the expected validation pool is:

```bash
git diff --check
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' build
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64' -only-testing:IssueCTLMacTests test
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS,arch=arm64,id=00008132-001105AE2E99801C' -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/<focused-test> test
```

If UI automation cannot prove a Spaces or menu-bar behavior reliably, record the attempted command and require a focused manual dogfood receipt instead of silently skipping proof.

## Canonical Board

Machine truth lives at:

`docs/goals/mac-ux-cleanup/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/mac-ux-cleanup/goal.md.
```


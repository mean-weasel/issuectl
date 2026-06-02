# T008 Diagnostics-First Session Surface

## Result

Done. The iOS app now has an API-backed diagnostics surface for active sessions and terminal connection failures.

## What Changed

- Added a Diagnostics action to the iOS session controls sheet so users can inspect launch, ttyd, tmux, activation, and webhook lifecycle events for a deployment without leaving the session list.
- Added `DeploymentDiagnosticsView`, which calls `APIClient.deploymentDiagnostics(deploymentId:)`, sorts events by timestamp, shows a summary, and renders level/status/message/timestamp details.
- Added a Diagnostics action to terminal connection failure UI so a failed attach/respawn can jump straight to the deployment timeline.
- Mapped launch and failure event names to human-readable labels, including `launch.requested`, `workspace.prepared`, `deployment.recorded`, `ttyd.spawned`, `deployment.activated`, `launch.spawn_failed`, `launch.activation_failed`, `reconcile.tmux_missing`, `liveness.tmux_missing`, and `ensure_ttyd.failed`.
- Mapped the PR webhook event names found in the web implementation, including `webhook.launched`, `webhook.pr_launched`, `webhook.auto_review_label_consumed`, `webhook.pr_session_ended`, `webhook.pr_coalesced`, `webhook.pr_followup_capped`, `webhook.pr_already_reviewed`, `webhook.pr_review_recovered`, `webhook.skipped_unsafe_pr`, and `webhook.launch_failed`.
- Added UI mock diagnostics routes for deployment timelines and a focused UI test that opens diagnostics from an active issue session and proves the failure message is visible.

## Evidence

- Red test observed before implementation: `testSessionDiagnosticsShowsLaunchFailureTimeline` reached the session controls sheet and failed with `Diagnostics action missing`.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/SessionManagementTests/testSessionDiagnosticsShowsLaunchFailureTimeline` passed after implementation.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/SessionManagementTests` passed: 7 tests, 0 failures.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/APIClientExtensionTests/testDeploymentDiagnosticsUsesDiagnosticsEndpoint` passed.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests` passed: 269 tests, 0 failures.
- `git diff --check` passed.
- Direct inspection found the required launch/failure producers in `packages/core/src/launch/launch-diagnostics.ts`, `packages/core/src/launch/ttyd.ts`, `packages/web/lib/idle-checker.ts`, and `packages/web/lib/ensure-ttyd.ts`.
- Direct inspection found PR webhook producers in `packages/web/lib/webhook-pr-intent.ts`, `packages/web/lib/webhook-pr-review-state.ts`, and `packages/web/lib/webhook-intent-worker.ts`.
- Direct inspection found iOS label mappings in `apple/IssueCTL/Views/Sessions/SessionListView.swift`.

## Notes

- The board requested an iPhone 16 simulator for the broad unit-test command, but `xcrun simctl list devices available` showed only iPhone 17-family devices. Verification used the booted iPhone 17 simulator.

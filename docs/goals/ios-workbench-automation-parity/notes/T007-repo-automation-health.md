# T007 - Repo Automation Status And Webhook Health

## Result

Done for the read-only iOS parity slice.

## Summary

The iOS Settings repo list and edit sheet now consume the native repo automation fields and show whether issue sessions, PR reviews, webhook installation, agents, payload mode, and review preamble are configured. The edit sheet calls the repo webhook-health REST contract and renders the health state, summary, details, expected URL, hook ID, and latest delivery metadata.

Mutating setup controls remain intentionally deferred to T011: enabling/disabling automation, webhook install/rotate, label repair, and active-session disable warnings require a separate write-path slice with server mutation proof.

## Changed Files

- `apple/IssueCTLShared/Models/Repo.swift`
- `apple/IssueCTL/Views/Settings/SettingsView.swift`
- `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`
- `apple/IssueCTLTests/ModelDecodingTests.swift`
- `apple/IssueCTLUITests/Helpers/MockServer.swift`
- `apple/IssueCTLUITests/SettingsTests.swift`

## Verification

- `git diff --check` passed.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLTests/ModelDecodingTests/testRepoDecodesAutomationFields -only-testing:IssueCTLTests/APIClientExtensionTests/testRepoWebhookHealthUsesHealthEndpoint` passed: 2 tests, 0 failures.
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL -destination 'platform=iOS Simulator,name=iPhone 17' -only-testing:IssueCTLUITests/SettingsTests/testSettingsShowsRepoAutomationAndWebhookHealth` passed: 1 test, 0 failures.
- Direct inspection found native repo automation fields, Settings repo-row summaries, Edit Repository automation/webhook-health rows, the webhook-health API call, and the mock webhook-health route.

## Strongest Disproof Attempt

The UI smoke test tapped the `org/alpha` Settings row, verified its accessibility label included `Issues + PR reviews` and `Webhook #123`, opened Edit Repository, and waited for `GitHub webhook delivery looks healthy` from the mock `/api/v1/repos/org/alpha/webhook/health` route. This disproves the main failure mode where the model decodes fields but the user-facing Settings UI never renders or fetches webhook health.

## Deferred

- Repo automation write controls for issue and PR automation settings.
- Webhook install/rotate controls.
- Trigger-label repair controls.
- Active-session warnings that disable unsafe repo automation edits while sessions are running.

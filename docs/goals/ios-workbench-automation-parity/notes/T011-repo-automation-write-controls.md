# T011 - Repo Automation Write Controls

## Result

Done.

## Summary

The iOS Edit Repository sheet now exposes native write-path controls for the web repo automation model: issue auto-launch, PR auto-review, issue/review agents, review preamble, webhook payload mode, webhook install/rotate, and required-label check/repair. The controls use the stable REST contracts:

- `PATCH /api/v1/repos/:owner/:repo`
- `POST /api/v1/repos/:owner/:repo/webhook`
- `GET /api/v1/repos/:owner/:repo/labels`
- `POST /api/v1/repos/:owner/:repo/labels`

The sheet also warns that disabling automation can end active webhook-launched sessions on the server.

## Changed Files

- `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`
- `apple/IssueCTLShared/Services/APIClient+Settings.swift`
- `apple/IssueCTLTests/APIClientTests.swift`
- `apple/IssueCTLTests/APIClientExtensionTests.swift`
- `apple/IssueCTLUITests/Helpers/MockServer.swift`
- `apple/IssueCTLUITests/SettingsTests.swift`

## Verification

- `git diff --check` passed.
- Focused API tests passed: `testUpdateRepoSendsPatchBodyAndDecodesRepo`, `testUpdateRepoAutomationSendsFullPatchBody`, `testConfigureRepoWebhookUsesWebhookEndpoint`, and `testRecreateRepoLabelsUsesLabelsEndpoint`.
- Focused UI test passed: `IssueCTLUITests/SettingsTests/testEditRepoAutomationControlsSaveAndRepairLabels`.
- Full Settings UI tests passed: 6 tests, 0 failures.
- Direct inspection found typed API methods, the automation warning, label repair controls, webhook-health call, webhook configure call, and label repair call sites.

## Strongest Disproof Attempt

The UI test starts with a repo missing all required issuectl labels, toggles PR review automation, checks labels, observes `Missing issuectl:deployed`, repairs labels through the mocked POST route, observes `Repaired`, and saves. This disproves the main failure mode where the buttons exist but are disconnected from REST-backed behavior.

# T007 Worker Receipt: Automation Settings

## Result

`done`

## Summary

Implemented the iOS repo automation settings slice. Repository settings now expose issue auto-launch, PR auto-review, issue/review agent defaults, webhook payload mode, review preamble, on-demand webhook health, webhook install/rotate, and automation-label recreation. Settings also warns before saving disabled automation when webhook-triggered sessions are still active.

## Implementation Notes

- Extended repo rows in Settings to show automation/webhook state at a glance.
- Expanded `EditRepoSheet` with native Form controls for issue and PR automation settings, agent selection, webhook payload mode, and review preamble.
- Added on-demand webhook health, install/rotate, and label recreation actions using the T003 API client methods.
- Added an active webhook-session check before saving disabled automation; if webhook-triggered sessions are still active, iOS shows a confirmation instead of silently saving.
- Extended the UI mock server to record repo update, webhook action, and label recreation payloads for measurable tests.

## Verification

- Red check: `IssueCTLUITests/SettingsTests/testRepoEditorShowsAutomationWebhookAndLabelControls` failed before implementation because `edit-repo-auto-launch-toggle` was missing.
- `git diff --check` passed.
- `IssueCTLUITests/SettingsTests/testRepoEditorShowsAutomationWebhookAndLabelControls` passed after implementation.
- `IssueCTLUITests/SettingsTests/testDisablingAutomationWarnsWhenWebhookSessionIsActive` passed after tightening the switch tap to target the actual control.
- Focused settings/API/model regression passed: all `SettingsTests` plus `ModelDecodingTests/testRepoDecodesAutomationFields`, `APIClientExtensionTests/testUpdateRepoSendsAutomationFields`, `APIClientExtensionTests/testWebhookHealthUsesRepoHealthEndpoint`, `APIClientExtensionTests/testConfigureWebhookSendsAction`, and `APIClientExtensionTests/testRecreateRepoLabelsSendsAction`: 11 tests, 0 failures.

## Remaining Risk

The full `IssueCTL` scheme still has not completed locally because earlier broad runs were blocked by simulator timeout/CoreSimulator instability. This slice did not require new web routes beyond the T003 webhook/label REST shims, so focused iOS API and UI tests are the local proof.

Issue and PR detail label-control UX remains queued for T008.

## Next Task

Activate `T008` to implement issue auto-launch and PR auto-review label UX with webhook health context.

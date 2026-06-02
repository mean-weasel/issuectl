# T005 Webhook Settings and Health Worker Receipt

## Result

Done.

## Changes

- `AdvancedSettingsView` now exposes `public_webhook_base_url` as an editable Webhooks setting.
- Settings API extension tests now prove the Swift client can read and PATCH `public_webhook_base_url`.
- `EditRepoSheet` now uses `WebhookHealthPresentation` so `unknown` webhook health is distinct from warning/error:
  - `unknown` uses `questionmark.circle.fill` and secondary tint.
  - `error` uses red.
  - `warning` uses orange.
  - `ok` remains green.
- `ViewLogicTests` cover the unknown-state presentation mapping.

## Verification

Passed:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/APIClientExtensionTests/testGetSettingsUsesSettingsEndpointAndDecodesDictionary \
  -only-testing:IssueCTLTests/APIClientExtensionTests/testUpdateSettingsSendsPatchBodyAndDecodesSuccess \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -quiet
```

Observed output included:

```text
Testing started
```

with exit code `0`.

Passed:

```bash
git diff --check
```

## Notes

- `xcodebuild` regenerated `apple/IssueCTL/Generated/AppVersion.swift`; it was restored to `HEAD` content after the test run because it is outside this Worker package.
- No server changes were needed because the web settings route already allows `public_webhook_base_url` and webhook health already includes `unknown`.

# T004 Judge Review: Accept Route Focus, Select Webhook Settings/Health

## Decision

Accept T003 and continue.

## Rationale

T003 stayed inside its allowed files, passed focused verification, and restored the generated AppVersion drift caused by Xcode. The route-focus gap is not fully final-audited until simulator deep-link proof exists, but the implementation and focused tests are sufficient to move to the next safe local slice.

The next largest safe useful slice is webhook settings/health clarity:

- Web settings allow `public_webhook_base_url`.
- Swift API settings can already PATCH arbitrary allowed keys.
- iOS Advanced Settings does not expose the field.
- Webhook health can be `unknown`, but iOS displays all non-`ok` states as warning.

## Worker Objective

Expose `public_webhook_base_url` in Advanced Settings and make webhook health `unknown` visually distinct from warning/error in repo automation status.

## Allowed Files

- `apple/IssueCTL/Views/Settings/AdvancedSettingsView.swift`
- `apple/IssueCTL/Views/Settings/EditRepoSheet.swift`
- `apple/IssueCTLTests/APIClientExtensionTests.swift`
- `apple/IssueCTLTests/ViewLogicTests.swift`

## Verify

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/APIClientExtensionTests/testGetSettingsUsesSettingsEndpointAndDecodesDictionary \
  -only-testing:IssueCTLTests/APIClientExtensionTests/testUpdateSettingsSendsPatchBodyAndDecodesSuccess \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -quiet
```

## Stop If

- Implementation needs files outside the allowed list.
- Web settings no longer allow `public_webhook_base_url`.
- The unknown health state requires server behavior changes.
- Focused tests fail twice with the same failure.

## Remaining After This Slice

- Stream refresh coalescing.
- Conditional Today/Issues workbench-first-read decision.
- Diagnostics wording cleanup.
- Final simulator/UI proof and final audit.

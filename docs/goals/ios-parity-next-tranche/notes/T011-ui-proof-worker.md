# T011 UI Proof Worker

## Objective

Add targeted UI proof for Board/Sessions/Review deep-link routing and Advanced Settings public webhook base URL visibility.

## Initial Scope

Allowed files:

- `apple/IssueCTLUITests/IssueCTLUITests.swift`
- `apple/IssueCTLUITests/Helpers/MockServer.swift`
- `apple/IssueCTL/Views/Settings/AdvancedSettingsView.swift`

## Planned Proof

- Launch the app against `MockIssueCTLServer`.
- Drive real `issuectl://workbench`, `issuectl://sessions`, and `issuectl://reviews` URLs through XCTest.
- Assert the board route focuses the repo/deployment issue, sessions route applies the repo filter, and review route opens a review detail sheet.
- Assert Advanced Settings exposes the loaded `public_webhook_base_url` value.

## Result

Implemented targeted UI proof in `IssueCTLUITests` using real `XCUIApplication.open(_:)` URL handling against the mock server. Added mock fixtures for:

- `GET /api/v1/settings` returning `public_webhook_base_url`.
- `GET /api/v1/issues/org/beta/201` so the board deployment route can land on a beta issue detail.
- `GET /api/v1/pr-reviews/:id` so the review route can open a valid detail sheet.

The proof asserts:

- `issuectl://workbench?repo=org%2Fbeta&deployment=9101` opens the beta issue detail `#201`.
- `issuectl://sessions?repo=org%2Fbeta` selects the Active tab and visibly applies the beta repo route context.
- `issuectl://reviews/39507` opens `review-detail-header-39507`.
- Advanced Settings exposes `advanced-settings-public-webhook-base-url-field` with `https://hooks.example.test`.

## Verification

Passed:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLUITests/IssueCTLUITests/testDeepLinksFocusBoardSessionsAndReviewRoutes \
  -only-testing:IssueCTLUITests/IssueCTLUITests/testAdvancedSettingsShowsPublicWebhookBaseURL \
  -quiet
```

Passed:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests \
  -quiet
```

Passed:

```bash
git diff --check
```

Note: Xcode emitted repeated local `DTDKRemoteDeviceConnection`/`notification_proxy` warnings during simulator runs, but both targeted UI proof and the full `IssueCTLTests` target exited successfully after the final fixture fixes.

# T010 Worker Receipt: PR #423 HTTP Assertions

## Result

Added HTTP-level tests for the shared repository settings API used by the Mac repository settings flow.

## Changed Files

- `apple/IssueCTLTests/APIClientTests.swift`
- `apple/IssueCTLTests/APIClientExtensionTests.swift`

## Coverage Added

- `POST /api/v1/repos` method, body, and success response.
- `GET /api/v1/repos/github?refresh=true` path, query, and response decoding.
- `PATCH /api/v1/repos/:owner/:name` method, body, and updated repo response.
- `DELETE /api/v1/repos/:owner/:name` method, success response, and backend failure behavior.
- `TestableAPIClient.request` now uses URL-relative construction to preserve query strings in test requests, matching the production `APIClient` behavior more closely.

## Validation

- `git diff --check`: pass.
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -destination 'platform=iOS Simulator,OS=18.6,name=iPhone 16' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLTests/APIClientExtensionTests`: pass, 31 tests.

## Notes

- The first attempted iOS test destination, `platform=iOS Simulator,name=iPhone 16`, failed because Xcode could not resolve `OS:latest`; rerun succeeded with `OS=18.6`.
- This task intentionally did not address the Mac UI automation hang or real local dogfood requirement.

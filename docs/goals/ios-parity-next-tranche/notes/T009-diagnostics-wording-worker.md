# T009 Diagnostics Wording Worker Receipt

## Result

Done.

## Changes

- Removed the stale `issue #546` dependency comment from `APIClient.deploymentDiagnostics`.
- Updated the diagnostics sheet explanatory copy to say live diagnostics use the structured `/api/v1/diagnostics/deployments/:id` endpoint, without implying that current-main support is still future work.
- Preserved the existing endpoint path and `404` fallback behavior for older connected servers.

## Verification

Passed:

```bash
git diff --check
```

Passed:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/APIClientTests \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -quiet
```

Observed output included:

```text
Testing started
```

with exit code `0`.

## Notes

- `xcodebuild` regenerated `apple/IssueCTL/Generated/AppVersion.swift`; it was restored to `HEAD` content after the test run because it is outside this Worker package.

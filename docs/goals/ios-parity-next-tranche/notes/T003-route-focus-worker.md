# T003 Route-Focus Worker Receipt

## Result

Done.

## Changes

- `ContentView` now preserves pending routes for `.board`, `.sessions`, and `.review` instead of dropping them after tab selection.
- `BoardView` accepts a pending route binding and consumes `.board(repoFullName:deploymentId:)`.
- `WorkbenchStore` now has helpers to match repo full names, apply route repo filters, and find board issue targets by deployment ID.
- `SessionListView` accepts a pending route binding and consumes:
  - `.sessions(repoFullName:)` by switching to Sessions and applying the matching repo filter.
  - `.review(id:)` by switching to Reviews and opening `ReviewRunDetailSheet` for numeric review IDs.
- `WorkbenchStoreTests` cover repo full-name matching and deployment-to-board issue targeting.

## Verification

Passed:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -only-testing:IssueCTLTests/WorkbenchStoreTests \
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

- `xcodebuild` regenerated `apple/IssueCTL/Generated/AppVersion.swift`, which is outside this Worker package. That generated file was restored to `HEAD` content after the test run so the final diff stays inside the approved route-focus scope.
- No web/core tests were needed for this slice because no web/core contracts changed.

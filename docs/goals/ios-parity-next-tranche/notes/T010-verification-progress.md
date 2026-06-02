# T010 Verification Progress

## Completed Verification

Passed:

```bash
git diff --check
```

Passed focused tranche verification:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests/ViewLogicTests \
  -only-testing:IssueCTLTests/WorkbenchStoreTests \
  -only-testing:IssueCTLTests/APIClientExtensionTests/testGetSettingsUsesSettingsEndpointAndDecodesDictionary \
  -only-testing:IssueCTLTests/APIClientExtensionTests/testUpdateSettingsSendsPatchBodyAndDecodesSuccess \
  -only-testing:IssueCTLTests/APIClientTests \
  -quiet
```

Passed full unit-test target verification:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -only-testing:IssueCTLTests \
  -quiet
```

## Full Suite Attempt

Attempted:

```bash
xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTL \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -quiet
```

Result: interrupted after about nine minutes because it repeatedly emitted:

```text
IDELaunchParametersSnapshot: The operation couldn't be completed. (DebuggerLLDB.DebuggerVersionStore.StoreError error 0.)
IDELaunchParametersSnapshot: no debugger version
```

The command did not complete and therefore is not counted as proof.

## Simulator/UI Proof Status

XcodeBuildMCP listed all available simulators as `Shutdown`; no simulator was booted for interactive UI proof. Per the iOS debugger-agent workflow, the remaining route/settings walkthrough should run after a simulator is booted.

Pending proof URLs/actions:

```bash
xcrun simctl openurl booted "issuectl://workbench?repo=org%2Fapp&deployment=42"
xcrun simctl openurl booted "issuectl://sessions?repo=org%2Fapp"
xcrun simctl openurl booted "issuectl://reviews/16"
```

Also pending: visual confirmation that Advanced Settings shows the Public webhook base URL field.

## Current Completion Status

Not complete. Implementation and unit/focused tests are strong, but final simulator/UI proof is still missing.

# iOS Preview Testing

IssueCTL has two installable iOS app variants:

- Production: `IssueCTL`, bundle id `com.issuectl.ios`, URL scheme `issuectl`
- Preview: `IssueCTL Preview`, bundle id `com.issuectl.ios.preview`, URL scheme `issuectl-preview`

The preview app is intended for development, physical-device smoke tests, and feature validation without overwriting the production app on the same iPhone.

Merge queue validation should use the preview lane when a PR needs iOS smoke coverage before landing.

## Physical Device Roles

Use `iPhone-preview` as the only/default physical iPhone for preview-app deployment and testing. This is the device for:

- `IssueCTL Preview` installs
- preview smoke tests
- preview performance timing
- future preview/GitHub Actions runner workflows

Keep `iPhone-prod` reserved for production `IssueCTL` installs and production validation. Do not run preview deployments or preview smoke tests on `iPhone-prod` unless explicitly doing a production-device check.

When commands require `IOS_DEVICE_ID` or an Xcode destination id, list the currently connected devices and choose the identifier for `iPhone-preview`:

```bash
pnpm ios:list-devices
```

## App Lanes

Use `IssueCTL Preview` as the active development lane. It is the app to run from feature branches, local simulator testing, and physical-device smoke tests.

Keep `IssueCTL` as the stable production lane. Update it from trusted integration points such as `main`, tags, or release branches.

A third `IssueCTL Dev` app is not needed yet. Add one only if we need three simultaneous installed states on the same phone, for example:

- production: stable daily-use app
- preview: release candidate or branch under review
- development: local experimental build with intentionally unstable services/data

Until that need is real, a third target would add signing, scheme, URL, keychain, and CI surface area without changing the main workflow.

## Local Smoke Tests

Run the preview smoke suite on an available simulator:

```bash
pnpm ios:preview-smoke:fast
```

Run the full preview smoke suite on an available simulator:

```bash
pnpm ios:preview-smoke:full
```

Run the preview smoke suite on a physical iPhone:

```bash
IOS_DEVICE_ID=<device-udid> pnpm ios:preview-device-smoke:fast
```

Run the same preflight that GitHub Actions uses before a physical-device build:

```bash
pnpm ios:preview-runner-preflight
```

By default, the physical-device wrapper resolves `iPhone-preview` by name and uses the correct CoreDevice id for readiness checks and Xcode destination id for `xcodebuild`. Use `IOS_DEVICE_ID`, `IOS_XCODE_DEVICE_ID`, or `IOS_DESTINATION` only when overriding that default.

The physical-device wrapper checks that the iPhone is visible through CoreDevice before launching Xcode. Keep the iPhone unlocked and awake until the test runner starts. By default, physical runs time out instead of waiting indefinitely:

- `fast`: 420 seconds
- `pr`: 600 seconds
- `full`: 900 seconds

Override the timeout when needed:

```bash
IOS_DEVICE_ID=<device-udid> IOS_UI_SMOKE_TIMEOUT=1200 pnpm ios:preview-device-smoke:full
```

You can also pass a full Xcode destination:

```bash
IOS_DESTINATION='platform=iOS,id=<device-udid>' pnpm ios:preview-device-smoke:fast
```

List available device identifiers and preview destinations:

```bash
pnpm ios:list-devices
```

## Optional Pre-Push Check

Normal pushes do not require a connected iPhone. To opt into physical preview E2E before pushing iOS-related changes:

```bash
RUN_IOS_PREVIEW_E2E=1 IOS_DEVICE_ID=<device-udid> git push
```

The pre-push hook only runs this check when iOS-relevant files changed.

The existing simulator smoke hook is still available:

```bash
RUN_IOS_UI_SMOKE=1 git push
```

## Self-Hosted Merge Queue Runner

The required physical-device merge queue lane runs on the repo-scoped self-hosted runner attached to `iPhone-preview`.

Runner defaults:

- Runner name: `issuectl-iphone-preview`
- Runner labels: `self-hosted`, `macOS`, `issuectl-ios`, `iphone-preview`
- Runner install path: `~/issuectl-iphone-preview-runner`
- GitHub check name: `Physical iPhone Preview Smoke`
- Workflow: `.github/workflows/ios-physical-preview.yml`
- Test command: `IOS_DEVICE_NAME=iPhone-preview IOS_UI_SMOKE_PROFILE=pr ./scripts/ios-preview-device-smoke.sh`

The workflow emits a lightweight passing `pull_request` check so PRs can enter the merge queue. The actual physical-device run happens on `merge_group` and `workflow_dispatch`, which validates the queue tip rather than the stale PR head.

Register the runner from repository settings with the GitHub-provided command, then add the custom labels above. Install it as a launchd service on the MacBook so it survives logout/reboot. To inspect the installed service locally:

```bash
cd ~/issuectl-iphone-preview-runner
./svc.sh status
```

The LaunchAgent service runs without the same interactive keychain session as a terminal. The physical workflow therefore runs `scripts/ios-preview-runner-preflight.sh` before building. That preflight:

- unlocks the configured signing keychain when `IOS_PREVIEW_KEYCHAIN_PASSWORD` is set
- optionally refreshes the key partition list for non-interactive `codesign` access
- verifies an Apple Development signing identity is visible
- verifies Automation Mode does not require local authentication
- resolves `iPhone-preview` by name
- fails fast if the phone is unavailable or locked

Set the repository secret `IOS_PREVIEW_KEYCHAIN_PASSWORD` to the password for the login keychain or a dedicated preview signing keychain. The workflow passes that secret only to the self-hosted `merge_group` and `workflow_dispatch` job. The default keychain path is:

```bash
~/Library/Keychains/login.keychain-db
```

Override it with `IOS_PREVIEW_KEYCHAIN_PATH` only if the runner uses a dedicated CI keychain. If `codesign` fails from the LaunchAgent with `errSecInternalComponent`, run the preflight from the service-backed workflow first; the failure usually means the service cannot unlock or use the signing identity.

Automation Mode must be prepared once from an interactive admin session on the runner Mac:

```bash
automationmodetool enable-automationmode-without-authentication
```

After the workflow has run once and created the `Physical iPhone Preview Smoke` check context, add that check to the `main-protection` ruleset required status checks. Keep `iPhone-preview` unlocked and awake when the merge queue is active; the required check intentionally fails instead of skipping if the phone is unavailable.

## Project Generation

`ios/project.yml` is the source of truth for iOS targets and schemes. After editing it, regenerate the Xcode project:

```bash
cd ios
xcodegen generate
```

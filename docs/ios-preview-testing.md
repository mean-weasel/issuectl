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

Use the CoreDevice identifier from `pnpm ios:list-devices` for `IOS_DEVICE_ID`. In practice this can differ from the lower-level hardware id shown by some Xcode destination output.

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

## Project Generation

`ios/project.yml` is the source of truth for iOS targets and schemes. After editing it, regenerate the Xcode project:

```bash
cd ios
xcodegen generate
```

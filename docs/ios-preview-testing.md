# iOS Preview Testing

IssueCTL has two installable iOS app variants:

- Production: `IssueCTL`, bundle id `com.issuectl.ios`, URL scheme `issuectl`
- Preview: `IssueCTL Preview`, bundle id `com.issuectl.ios.preview`, URL scheme `issuectl-preview`

The preview app is intended for development, physical-device smoke tests, and feature validation without overwriting the production app on the same iPhone.

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

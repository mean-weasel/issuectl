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

## Physical Preview Performance Timing

Use the existing preview smoke wrapper to collect app-side `PerformanceTrace` timings from `iPhone-preview`. The wrapper resolves `iPhone-preview`, checks that the phone is visible and unlocked, and runs the `IssueCTLPreview-UISmoke` scheme with `ISSUECTL_UI_TESTING=1`, which mirrors timing events to device logs with a `[PerformanceTrace]` prefix.

Prerequisites:

- `iPhone-preview` is connected, trusted, unlocked, and awake
- `idevice_id` and `idevicesyslog` are available for live physical-device logs
- `idevice_id -l` or `idevice_id -n -l` lists the `iPhone-preview` Xcode destination UDID
- signing preflight passes:

```bash
pnpm ios:preview-runner-preflight
```

Run a repeatable timing pass and save the live PerformanceTrace log, summary, and Xcode result bundle:

```bash
pnpm ios:preview-perf:fast
```

The script writes artifacts to `/tmp` by default:

- `/tmp/issuectl-preview-perf-<timestamp>.log`
- `/tmp/issuectl-preview-perf-<timestamp>.summary.txt`
- `/tmp/issuectl-preview-perf-<timestamp>.xcresult`

Use `pnpm ios:preview-perf:full` when you need broader timing coverage across the preview smoke suite. Prefer the fast profile for quick before/after comparisons because it keeps the physical-device run shorter and reduces test-runner restart variance.

The wrapper fails the run if it cannot attach to the live device log stream or if the log stream produces no `PerformanceTrace` lines. If Xcode can run tests but `idevice_id` does not list the phone, reconnect or re-pair `iPhone-preview` so libimobiledevice can see it, then retry.

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

## Manual Preview Operations

Use `iOS Preview Runner Health` when you only need to check whether the self-hosted runner, signing keychain, Automation Mode, and `iPhone-preview` are ready. It is a manual `workflow_dispatch` workflow and does not build, install, or test the app.

Use `iOS Preview Install` when you need to install `IssueCTL Preview` on `iPhone-preview` from a selected ref. The workflow:

- accepts an optional `ref`
- builds the `IssueCTLPreview` scheme
- verifies the bundle id is `com.issuectl.ios.preview`
- installs only on `iPhone-preview`
- can optionally run physical preview UI smoke after install

These workflows are intentionally manual operational tools. Merge queue enforcement still happens through `iOS Physical Preview` and its required `Physical iPhone Preview Smoke` check.

## Manual Merge Queue Tip Testing

Use this flow when a PR needs a hands-on check of the exact merge queue build that will land on `main`.

Before enqueueing, make sure `iPhone-preview` is connected to the runner Mac, trusted, unlocked, and awake:

```bash
pnpm ios:list-devices
```

Confirm the resolver output names `iPhone-preview`. Do not continue with `iPhone-prod`; it is reserved for the production `IssueCTL` app and production validation.

Enqueue the PR from the GitHub PR page with **Merge when ready** or from the CLI:

```bash
gh pr merge <pr-number> --auto
```

For a branch protected by a merge queue, `gh pr merge` does not need a merge strategy. If required checks are still running, `--auto` enables auto-merge and GitHub enqueues the PR after the requirements pass. If requirements have already passed, GitHub adds the PR to the merge queue immediately.

After the PR enters the queue, open the merge queue entry or the PR checks list and watch the `merge_group` run for `iOS Physical Preview`. The check to verify is:

```text
Physical iPhone Preview Smoke
```

This check must run on the self-hosted `issuectl-iphone-preview` runner with the `iphone-preview` label. The `pull_request` check is only a placeholder; the manual test should use the `merge_group` check because it builds the merge queue tip commit.

When the `merge_group` check is running or has passed, verify the queue-tip app is installed on the physical preview phone:

1. On `iPhone-preview`, find `IssueCTL Preview` on the Home Screen or App Library. It should be installed separately from `IssueCTL`.
2. Open `IssueCTL Preview`, go to Settings, and check the app version/build string.
3. Compare the short build SHA in Settings with the merge queue tip SHA shown in the GitHub `merge_group` run. They should match.
4. Manually inspect the flow under review in `IssueCTL Preview`. Keep the phone unlocked and awake until inspection is complete.

Use the installed app identity to distinguish the two physical-device lanes:

| Device role | App to inspect | Bundle id | URL scheme | Use for |
|---|---|---|---|---|
| `iPhone-preview` | `IssueCTL Preview` | `com.issuectl.ios.preview` | `issuectl-preview` | merge queue tip builds, preview smoke tests, PR validation |
| `iPhone-prod` | `IssueCTL` | `com.issuectl.ios` | `issuectl` | production installs and production validation |

If `IssueCTL Preview` is missing from `iPhone-preview`, rerun or redispatch the `iOS Physical Preview` workflow for the merge queue ref. If the workflow cannot resolve the phone, unlock `iPhone-preview`, verify it appears in `pnpm ios:list-devices`, and rerun the failed check. Do not switch the merge queue check to `iPhone-prod`.

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

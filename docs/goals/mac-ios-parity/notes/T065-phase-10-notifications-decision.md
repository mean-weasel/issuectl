# T065 Phase 10 Notifications Decision

Date: 2026-05-14

## Decision

Decision: `defer_with_issue`

Defer real macOS push notification registration behind backend/platform issue https://github.com/mean-weasel/issuectl/issues/444, and add explicit Mac settings copy in this parity pass so the Mac app does not expose broken notification toggles.

## Evidence

- iOS notification registration is UIKit-specific in `apple/IssueCTL/Services/NotificationSettingsStore.swift` and calls `UIApplication.shared.registerForRemoteNotifications()`.
- iOS settings expose working toggles in `apple/IssueCTL/Views/Settings/NotificationSettingsView.swift`.
- Backend shared type `PushDevicePlatform` is currently only `"ios"` in `packages/core/src/types.ts`.
- `push_devices.platform` has a schema and migration check constraint limited to `ios`.
- `/api/v1/notifications/devices` rejects non-`ios` platforms.
- APNs sending currently uses one `ISSUECTL_APNS_BUNDLE_ID` topic, while the Mac app bundle is `com.issuectl.mac` and iOS is `com.issuectl.ios`.
- The Mac app has no push entitlement, no remote-notification delegate path, and no Mac notification settings section.

## Rationale

Implementing real macOS notifications now would cross backend schema, API validation, APNs topic configuration, Mac entitlements, Mac app delegate registration, shared preference extraction, UI, and manual signed-build delivery validation. That is too much for a safe single parity slice, and exposing toggles before platform support exists would be misleading.

The selected path satisfies Phase 10 by documenting the deferral, linking the required platform issue, and making Mac settings explicitly state that push notifications are iOS-only for now.

## Next Worker

Worker: `T066`

Objective: add a Mac settings Notifications section that clearly states Mac push notifications are unavailable/deferred, links the platform issue in receipt/docs, and exposes no interactive notification toggles.

Allowed files:

- `apple/IssueCTLMac/Views/MacSettingsView.swift`
- `apple/IssueCTLMacTests/**`
- `apple/IssueCTLMacUITests/**`
- `docs/goals/mac-ios-parity/**`

Acceptance criteria:

- Mac settings includes a Notifications section with copy that says push notifications are currently iOS-only on Mac and links the deferred platform work by issue number in code/docs/test evidence.
- Mac settings exposes no `notifications-idle-terminals-toggle`, `notifications-new-issues-toggle`, `notifications-merged-prs-toggle`, or Mac equivalents that imply working push registration.
- Unit or projection coverage proves the unavailable-state title/body/icon are stable.
- Mac UI coverage proves the settings surface is visible and no notification toggles are exposed.

Validation:

- `git diff --check`
- `pnpm typecheck`
- `pnpm lint`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase10a-mac -only-testing:IssueCTLMacTests/MacIssueFilterStateTests`
- `xcodebuild test -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' -derivedDataPath /tmp/issuectl-phase10a-mac -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testSettingsShowsNotificationUnavailableState`

Stop if:

- Adding the copy requires a broad settings architecture rewrite.
- The UI cannot expose stable assertions without brittle accessibility behavior.
- Product direction changes to require real macOS push implementation immediately.


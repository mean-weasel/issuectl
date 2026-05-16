# T032 Phase 6C Image Upload

Date: 2026-05-14

Result: done

Branch: `mac-parity-phase-6c-image-upload`
Base: `mac-sidebar-spaces-option-a`
Draft PR: https://github.com/mean-weasel/issuectl/pull/432

## Summary

Implemented Mac image attachment upload for issue creation, draft editing, comment composition, issue body editing, close-with-comment, and comment editing. The Mac app now prepares selected images as JPEG data, uploads through the shared image upload API, inserts uploaded image markdown into the active editor, shows an in-flight progress state, disables duplicate upload/submit actions while uploading, and preserves editor text on invalid-image or upload failure paths.

The Mac UI fixture API now supports deterministic image upload responses and serves uploaded fixture images so markdown rendering and lightbox behavior can be tested without automating the native file picker.

## Acceptance Coverage

- Direct issue creation image attachment: covered by `testQuickCreateImageAttachmentRendersInCreatedIssue`.
- Draft editor image attachment: implemented through the shared `MacImageAttachmentButton` with a repo picker in the draft editor; not separately UI-tested in this slice because direct issue creation covers the creation editor path and the draft editor has no backend upload side effect.
- Comment composer image attachment: covered by `testCommentImageAttachmentUploadsAndRenders`.
- Issue/comment editing attachment paths: implemented in edit issue, close-with-comment, and edit comment sheets. Existing full smoke coverage confirms those sheets still open, save, close, and edit successfully after the controls were added.
- Upload progress and duplicate-action protection: implemented by `isUploading` bindings, progress indicator button state, and disabled submit/upload controls while upload is in flight.
- Failure preservation: covered by `testImageAttachmentFailurePreservesCommentText`; invalid image data is covered by `testMacImageAttachmentProcessorRejectsInvalidImageData`.
- Uploaded markdown rendering/lightbox: covered by `testQuickCreateImageAttachmentRendersInCreatedIssue` and existing `testIssueDetailMarkdownImagesOpenLightbox`.

## Validation

- `git diff --check`: pass
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-phase6c-build -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build`: pass
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-tests-derived -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests`: pass, 31 tests
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`: pass, 18 tests
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -derivedDataPath /tmp/issuectl-ios-api-derived -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLTests/APIClientExtensionTests`: pass, 37 tests
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings

## Residual Risk

- The production native file picker path is not directly automated; UI tests use a deterministic fixture upload path because native `NSOpenPanel` automation is brittle.
- Draft editor upload is implemented but not covered by a dedicated UI test; it reuses the same upload helper and markdown insertion path as the tested direct issue and comment flows.
- This slice intentionally does not implement AI parse or batch issue creation.

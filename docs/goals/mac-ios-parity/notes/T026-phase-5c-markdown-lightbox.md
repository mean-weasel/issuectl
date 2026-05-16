# T026 Phase 5C Markdown Lightbox

## Result

`done`.

Implemented Mac issue-detail markdown image presentation and image lightbox support in PR #429.

## PR Status

- PR: https://github.com/mean-weasel/issuectl/pull/429
- Branch: `mac-parity-phase-5c-markdown-lightbox`
- Base: `mac-sidebar-spaces-option-a`
- Status: draft until review/merge gate

## Changes

- Mac issue bodies and comments now split markdown image syntax into tappable rendered image attachments while preserving inline markdown text and fenced code rendering.
- Rendered image attachments open a Mac lightbox with deterministic loaded-image coverage for fixture images.
- Broken image URLs open a recoverable lightbox error state and can be dismissed.
- Mac UI fixtures now include image and missing-image markdown in issue detail data.
- `MacSidebarSmokeTests` covers rendered image visibility, loaded-image lightbox open/close, broken-image error state, and existing detail/settings flows.

## Validation

- `git diff --check`: pass
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-phase5c-build -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build`: pass
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-phase5c-tests -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLMacTests`: pass, 29 tests
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -derivedDataPath /tmp/issuectl-ios-phase5c-tests -destination 'platform=iOS Simulator,name=iPhone 17' CODE_SIGNING_ALLOWED=NO test -only-testing:IssueCTLTests/APIClientExtensionTests`: pass, 37 tests
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests/testIssueDetailMarkdownImagesOpenLightbox`: pass
- `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -derivedDataPath /tmp/issuectl-mac-ui-derived -destination 'platform=macOS,arch=arm64' test -only-testing:IssueCTLMacUITests/MacSidebarSmokeTests`: pass, 11 tests
- `pnpm typecheck`: pass
- `pnpm lint`: pass with existing warnings

## Notes

- The focused lightbox test was strengthened after the first full smoke pass to assert broken-image error presentation and dismissal. The full smoke suite was rerun after that change and passed.
- `pnpm lint` warnings are pre-existing TypeScript max-lines/unused/explicit-any warnings outside this slice.
- The iOS build regenerated `apple/IssueCTL/Generated/AppVersion.swift`; that generated file was restored because it is unrelated to this Mac PR.

## Next Gate

Judge PR #429 for acceptance criteria coverage, update the PR body, inspect GitHub checks, then mark ready and merge only if the GitHub or accepted replacement validation gate is satisfied.

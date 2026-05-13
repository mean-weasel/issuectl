# IssueCTLMac Release Notes

## Current Icon

The macOS app icon is a temporary AppIcon asset generated from `packages/web/public/icon.svg`.
Replace the asset catalog when final shared Apple branding is available.

## Local Debug Build

From the repo root:

```sh
xcodegen generate --spec apple/project.yml
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Debug -destination 'platform=macOS,arch=arm64' CODE_SIGNING_ALLOWED=NO build
```

The debug app is usually written under:

```text
~/Library/Developer/Xcode/DerivedData/IssueCTL-*/Build/Products/Debug/IssueCTLMac.app
```

## Local Release Build

From the repo root:

```sh
xcodegen generate --spec apple/project.yml
xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Release -destination 'platform=macOS,arch=arm64' build
```

The release app is usually written under:

```text
~/Library/Developer/Xcode/DerivedData/IssueCTL-*/Build/Products/Release/IssueCTLMac.app
```

## Archive

From the repo root:

```sh
xcodegen generate --spec apple/project.yml
xcodebuild archive -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -configuration Release -destination 'generic/platform=macOS' -archivePath "$PWD/build/IssueCTLMac.xcarchive"
```

The archive is written to:

```text
build/IssueCTLMac.xcarchive
```

## Signing And Notarization Backlog

- Confirm the production Developer ID Application certificate and provisioning setup.
- Add a repeatable export step for the archived `.app`.
- Add notarization with `xcrun notarytool`.
- Staple the notarization ticket before distributing.

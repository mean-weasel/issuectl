# Iteration 3

## Summary

Moved image attachment preparation off-main: selected image data is now downsampled to a bounded 1600px JPEG on a detached user-initiated task, and uploads send prepared JPEG Data instead of passing a full-size UIImage through APIClient.

## Verification

PASS: xcodebuild build -project ios/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO

## Process Learning Reflection

- Local-only:
- Candidate skill learning:
- Candidate repo change:
- Upstream review proposed:

## Judge Decision

More material iOS performance work remains, especially image attachment downsampling and list-row derivation.

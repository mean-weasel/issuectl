# issuectl-ios

Native SwiftUI iOS app for issuectl — a GitHub issue command center with Claude Code launch integration.

## Project overview

- **Target:** iOS 18+, iPhone only (universal binary, phone-optimized)
- **Architecture:** SwiftUI + Swift Concurrency (async/await)
- **Persistence:** SwiftData for local caching
- **Networking:** URLSession with async/await
- **Server:** Connects to issuectl server via REST API at `/api/v1/`
- **Project generation:** Uses xcodegen — run `xcodegen generate` after modifying project.yml

## Code conventions

- **SwiftUI only.** No UIKit unless absolutely necessary (WKWebView wrapper is the exception).
- **No third-party dependencies.** Use only Apple frameworks.
- **Async/await everywhere.** No completion handlers.
- **@Observable macro** for state management (iOS 18+).

## Build and run

Build and run via XcodeBuildMCP from Claude Code:
- `build_sim` — build for simulator
- `build_run_sim` — build and launch on simulator
- `screenshot` — capture current simulator state
- `test_sim` — run tests on simulator

Or via xcodebuild (use `-target` instead of `-scheme` due to xcodegen scheme compatibility):
```bash
xcodebuild -project IssueCTL.xcodeproj -target IssueCTL -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

## File organization

```
IssueCTL/
├── App/           # App entry point, root views
├── Models/        # Codable structs matching API responses
├── Services/      # APIClient, KeychainService, CacheService
└── Views/         # Organized by feature (Issues/, PRs/, etc.)
```

## API connection

The app connects to a self-hosted issuectl server. The server URL and bearer token are configured on first launch and stored in Keychain.

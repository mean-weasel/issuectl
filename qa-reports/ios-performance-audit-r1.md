# iOS Performance Audit R1

Date: 2026-05-03
Target: `ios/IssueCTL.xcodeproj`, scheme `IssueCTL`
Baseline: fresh worktree from `origin/main` at `46568d1`
Method: SwiftUI code review plus simulator build verification. No Instruments trace was captured in this pass.

## Summary

The app is structurally healthy enough to build cleanly, but the main list/detail screens still do too much derived work during SwiftUI render passes. The biggest opportunities are to remove repeated repo lookups and filter/count/sort work from `body`, move markdown parsing out of render, and stop forcing network decoding through a `@MainActor` API client.

Build verification:

| Check | Result |
|---|---|
| `xcodebuild build -project ios/IssueCTL.xcodeproj -scheme IssueCTL -configuration Debug -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO` | PASS |

## Findings

### P1 - List screens repeatedly recompute filters, counts, sorts, and repo ownership during render

Evidence:
- `IssueListView.filteredIssues` filters and sorts the full issue set every time SwiftUI evaluates the view (`ios/IssueCTL/Views/Issues/IssueListView.swift:69`).
- `IssueListView.sectionCounts` performs multiple full passes over `repoFilteredIssues` and also calls repo lookup/running-session helpers (`IssueListView.swift:112`).
- `issuesList` calls `filteredIssues`, then each visible row calls `repoIndex(for:)`, `repoFor(issue:)`, and `isRunning(...)` (`IssueListView.swift:485`).
- `PRListView` has the same shape for `filteredPulls`, `sectionCounts`, and per-row repo lookup (`ios/IssueCTL/Views/PullRequests/PRListView.swift:49`, `PRListView.swift:77`, `PRListView.swift:358`).
- `repoForItem` scans every repo bucket and then scans each bucket's items to match by URL (`ios/IssueCTL/Helpers/RepoFilterHelpers.swift:28`), making row rendering O(repos * items) per lookup.

Likely impact:
Typing in search, switching tabs, refreshing, or updating action state can re-run this work even when the underlying issue/PR data has not changed. With enough repos and cached items this is the most likely source of list jank.

Recommended fix:
- Build a derived list model when inputs change: rows should already contain `item`, `repo`, `repoIndex`, `isRunning`, and any priority/sort metadata needed by the row.
- Build dictionaries once per load/filter change: `repoByFullName`, `repoByItemID`, and `deploymentByIssueKey`.
- Compute counts in the same pass used to produce the visible rows.
- Keep `body` limited to slicing `visibleRows.prefix(displayLimit)` and rendering rows.

Estimated effort: medium. Start with `IssueListView`, then apply the same pattern to `PRListView`.

### P1 - `APIClient` is `@MainActor`, so JSON decoding and request setup are serialized through the main actor

Evidence:
- `APIClient` is declared `@Observable @MainActor` (`ios/IssueCTL/Services/APIClient.swift:3`).
- Endpoint methods call `URLSession.shared.data(for:)`, then immediately decode JSON using the client decoder while still isolated to the main actor (`APIClient.swift:50`, `APIClient.swift:117`, `APIClient.swift:124`, `APIClient.swift:131`, `APIClient.swift:138`).
- List screens launch many concurrent per-repo child tasks, but those tasks call methods on the main-actor client (`IssueListView.swift:822`, `PRListView.swift:512`, `TodayView.swift:431`, `TodayView.swift:459`).

Likely impact:
Network waits suspend, but each API method must enter the main actor for request construction, response validation, and JSON decoding. That undermines the intended concurrency in the per-repo task groups and can add main-thread pressure during refreshes.

Recommended fix:
- Split configuration state from transport. Keep a small main-actor observable settings object for `serverURL`, `apiToken`, and `isConfigured`.
- Move request/decoding to a non-main-actor `APITransport` or `actor APIClientTransport`.
- Snapshot auth config before starting task groups so child tasks do not need main-actor access.
- If a full split is too much, make decoding helpers `nonisolated` and avoid reading mutable observable state after the request is built.

Estimated effort: medium-high because several screens depend on `@Environment(APIClient.self)`.

### P2 - Markdown parsing and code-block splitting run inside `MarkdownView.body`

Evidence:
- `MarkdownView.body` calls `splitCodeBlocks(content)` on each render (`ios/IssueCTL/Views/Shared/MarkdownView.swift:13`).
- Each prose block is parsed with `AttributedString(markdown:)` during view construction (`MarkdownView.swift:39`, `MarkdownView.swift:54`).
- Issue detail, PR detail, and comments render markdown bodies and comments (`IssueDetailView.swift:266`, `IssueDetailView.swift:419`, `ios/IssueCTL/Views/PullRequests/PRDetailView.swift:140`).

Likely impact:
Large issue bodies or many comments can reparse markdown during unrelated state changes, such as priority loading, stale-hint animation, action error presentation, or pull-to-refresh state.

Recommended fix:
- Introduce a small `MarkdownRenderer`/cache keyed by content hash that returns precomputed `[MarkdownBlock]` with either `AttributedString` or code text.
- Compute markdown blocks when detail data is loaded, or memoize inside a helper object rather than inside `body`.
- Keep the SwiftUI view as a pure renderer of already-parsed blocks.

Estimated effort: low-medium.

### P2 - Image upload decodes full-size images on the main actor and re-encodes without downsampling

Evidence:
- `ImageAttachmentButton.upload(item:)` loads raw `Data`, then calls `UIImage(data:)` (`ios/IssueCTL/Views/Shared/ImageAttachmentButton.swift:48`).
- `APIClient+ImageUpload` calls `image.jpegData(compressionQuality: 0.8)` before uploading (`ios/IssueCTL/Services/APIClient+ImageUpload.swift:21`).
- The view and API client are main-actor-bound through SwiftUI state and `APIClient`.

Likely impact:
Attaching a large photo can spike memory and CPU, and the UI can hitch during decode or JPEG encode.

Recommended fix:
- Load image data off the main actor.
- Downsample to a max dimension suitable for issue comments before creating a `UIImage`.
- JPEG encode off-main, then upload `Data` directly so the client does not need a full-size `UIImage`.

Estimated effort: low-medium.

### P2 - Session polling refreshes repos every 10 seconds

Evidence:
- `SessionListView` has an autoconnecting 10 second timer (`ios/IssueCTL/Views/Sessions/SessionListView.swift:22`).
- Each tick calls `load()` (`SessionListView.swift:142`).
- `load()` fetches both active deployments and repos on every tick (`SessionListView.swift:291`).

Likely impact:
For users who leave Sessions open, the app repeatedly fetches relatively static repo data and re-evaluates the full view. This is probably acceptable at current scale, but it is unnecessary work and easy to trim.

Recommended fix:
- Fetch repos only when the list is empty or on explicit refresh.
- Poll only `activeDeployments()` on the timer.
- Pause polling while a terminal full-screen cover is presented, or when there are no active deployments.

Estimated effort: low.

### P3 - Detail screens use eager `ScrollView` + `VStack` for potentially large detail payloads

Evidence:
- `IssueDetailView` renders detail content in `ScrollView { VStack(...) }` (`ios/IssueCTL/Views/Issues/IssueDetailView.swift:74`).
- Comments are rendered by a normal `ForEach` inside that `VStack` (`IssueDetailView.swift:419`).
- `PRDetailView` uses the same pattern for checks, reviews, files, and linked content (`ios/IssueCTL/Views/PullRequests/PRDetailView.swift:34`).

Likely impact:
Small details are fine. Large issue threads or PR file lists are built eagerly, which can increase initial detail open time and memory.

Recommended fix:
- Consider `LazyVStack` for comments/files/reviews once payloads cross a practical threshold.
- Pair this with the markdown cache first; lazy containers alone will not fix markdown parse cost for visible rows.

Estimated effort: low after markdown refactor.

## Suggested Order

1. Derive issue/PR list rows and counts outside `body`.
2. Split non-UI API transport/decoding away from the main actor.
3. Cache parsed markdown blocks for detail/comment rendering.
4. Downsample and encode image attachments off-main.
5. Narrow Sessions polling to deployments only.

## Validation Plan

After implementing each change, use the same scenario before/after:

- Release build on simulator or device.
- Instruments SwiftUI + Time Profiler trace for:
  - issue list load with several repos,
  - search typing on Issues and PRs,
  - issue detail open with long body/comments,
  - image attach from a large photo,
  - Sessions screen left open for 60 seconds.
- Compare main-thread time, SwiftUI body evaluations, dropped frames, and memory peak.

## Verification After R1 Changes

Date: 2026-05-03
Worktree: `/Users/neonwatty/Desktop/issuectl/.worktrees/ios-performance-audit`

| Check | Result | Notes |
|---|---:|---|
| `pnpm --filter @issuectl/web test -- api-auth.test.ts` | PASS | 12 tests passed |
| `pnpm test` | PASS | 3 tasks passed; core 469 tests, web 214 tests |
| `pnpm typecheck` | PASS | 4 tasks passed |
| Simulator full preview smoke | PASS | 7 tests, 0 failures, 187.133s test time, 193s wall clock |
| Physical iPhone fast preview smoke | PASS | 33.291s test time, 57s wall clock |
| Physical iPhone full preview smoke | PASS with rerun note | Full suite had 1 notification-interrupted failure in 199.606s; isolated failed test rerun passed in 34.789s |

Simulator result bundle:
`/Users/neonwatty/Library/Developer/Xcode/DerivedData/IssueCTL-gkvtpfbdwvveisbnsuosbslswfuu/Logs/Test/Test-IssueCTLPreview-UISmoke-2026.05.03_13-54-34--0700.xcresult`

Physical result bundles:
- Full suite: `/Users/neonwatty/Library/Developer/Xcode/DerivedData/IssueCTL-gkvtpfbdwvveisbnsuosbslswfuu/Logs/Test/Test-IssueCTLPreview-UISmoke-2026.05.03_13-42-06--0700.xcresult`
- Isolated rerun: `/Users/neonwatty/Library/Developer/Xcode/DerivedData/IssueCTL-gkvtpfbdwvveisbnsuosbslswfuu/Logs/Test/Test-IssueCTLPreview-UISmoke-2026.05.03_13-46-19--0700.xcresult`

## Measurement Pass R2

Do not run another broad optimization loop before collecting these numbers. Add lightweight `os_signpost` timing around:

| Flow | Start | End | Metric |
|---|---|---|---|
| App launch to usable Today | app init / first scene render | `today-create-issue-button` visible | cold/warm launch latency |
| Today data refresh | `TodayView.load()` start | issues, PRs, deployments assigned | refresh wall time |
| Issues list refresh | `IssueListView.load()` start | rows assigned and first list render | list load latency |
| PR list refresh | `PRListView.load()` start | rows assigned and first list render | list load latency |
| Issue detail open | navigation selection | detail content visible | detail latency |
| Sessions poll | timer tick | deployments assigned | poll latency and request count |
| Image attach/upload | Photos data loaded | markdown inserted | decode/encode/upload split |

Capture on both simulator and physical iPhone:
- One cold run after reinstall.
- Three warm runs without reinstall.
- One stress run with the largest available issue body/comment thread and a large photo attachment.

Use the current R1 smoke timings as the acceptance floor: future changes should keep the full simulator preview smoke near 187s and must not reintroduce notification-independent physical failures.

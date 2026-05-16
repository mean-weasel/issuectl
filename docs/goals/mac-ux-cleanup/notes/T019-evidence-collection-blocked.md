# T019 Evidence Collection Receipt And Blocker

## Result

Done.

## Objective

Collect the final local dogfood or focused UI evidence needed to complete the Mac UX cleanup tranche.

## Evidence Attempted

- Checked current free disk with `df -h .`.
  - Result: about 490 MB free on `/System/Volumes/Data`.
- Checked current IssueCTL Xcode result bundles.
  - Result: current `.xcresult` bundles total about 1.5 MB and are not the source of disk pressure.
- Checked IssueCTL DerivedData size.
  - Result: about 319 MB total, with about 262 MB in generated build artifacts. Clearing only IssueCTL DerivedData would still leave low headroom after rebuild.
- Launched the built Debug Mac app directly, without XCTest, using the same fixture environment as `MacSidebarSmokeTests`:
  - `ISSUECTL_UI_TESTING=1`
  - `ISSUECTL_MAC_UI_FIXTURE_API=1`
  - `ISSUECTL_SERVER_URL=http://issuectl-ui-test.local`
  - `ISSUECTL_API_TOKEN=mac-ui-smoke-token`
  - App path: `/Users/jeremywatt/Library/Developer/Xcode/DerivedData/IssueCTL-geyzhbdgjeunitfwitujglpifvbw/Build/Products/Debug/IssueCTLMac.app/Contents/MacOS/IssueCTLMac`
- Captured and inspected live screenshots under `/tmp/issuectl-mac-evidence-*.png`.

## Partial Manual Evidence Collected

- Sidebar Issues evidence:
  - Initial live app screenshot showed the floating `IssueCTL` sidebar with fixture data, header summary, refresh/collapse/hide/more controls, the `Issues` tab selected, collapsed `Filters`, collapsed `Repositories`, count chips, and the issue list.
  - `issuectl-mac-evidence-issues-filters-expanded.png` showed the `Filters` disclosure expanded with state controls, sort controls, `Mine`, `Reset`, section count chips, and filter summary.
  - `issuectl-mac-evidence-issues-running-chip-2.png` showed the `Running` count chip selected, the header summary changed to `Running - Updated`, and the list reduced to the single running issue.
  - `issuectl-mac-evidence-issues-repos-expanded-2.png` showed the `Repositories` disclosure expanded with `All`, `None`, and per-repository checkboxes.
- Sidebar Pull Requests evidence:
  - `issuectl-mac-evidence-prs-initial.png` showed the `PRs` tab selected with collapsed `Filters` and `Repositories`, count chips, the PR filter summary, and fixture PR rows.
  - `issuectl-mac-evidence-prs-filters-expanded.png` showed the `Filters` disclosure expanded with section controls, sort controls, `Mine`, `Reset`, count chips, and unchanged PR rows.
- Panel/collapsed rail evidence:
  - `issuectl-mac-evidence-collapsed-rail.png` showed the app collapsed to the narrow rail with the new `Expand` control and numeric badges for Issues, Drafts, Active, and terminal/session areas.
  - The collapsed rail close control hid the panel; this confirms hide behavior but was not a complete hide/show/collapse regression pass.
  - `issuectl-mac-evidence-panel-show-expanded-clean.png`, `issuectl-mac-evidence-panel-collapse-clean.png`, `issuectl-mac-evidence-panel-expand-clean.png`, and `issuectl-mac-evidence-panel-hide-clean.png` covered a clean direct-app panel show, collapse, expand, and hide sequence after the titlebar chrome changes.
  - `issuectl-mac-evidence-collapsed-rail-offline-final.png` showed the collapsed rail in the offline fixture state with the orange offline indicator plus numeric badges still visible.
- Status menu evidence:
  - `issuectl-mac-evidence-status-menu-clean.png` showed the status item menu reporting `Current Desktop: Desktop 1`, `Sidebar: Hidden, Collapsed`, stateful `Show Desktop 1 Sidebar`, `Expand Desktop 1 Sidebar`, `Refresh Sidebar`, `Desktop Layouts`, `Settings...`, and `Quit IssueCTL`.
  - The `Settings...` menu item opened the settings window.
- Settings evidence:
  - `issuectl-mac-evidence-settings-window.png` showed the settings window with `Offline Queue`, `Connection`, `Mac Sidebar`, and `Repositories` ordered near the top.
  - `issuectl-mac-evidence-settings-add-repository-sheet.png` showed the repository add sheet opening from the high-priority `Repositories` section.
  - `issuectl-mac-evidence-settings-edit-repository-sheet.png` showed the edit repository sheet with the local path field and `Choose Folder` action.
  - `issuectl-mac-evidence-settings-folder-chooser-panel.png` showed the native folder chooser opened from `Choose Folder` with the message `Choose the local clone folder for org/alpha.`
- Filtered empty-state recovery evidence:
  - `issuectl-mac-evidence-issues-empty-recovery-2.png` showed an impossible Issues search producing `No Matches` with `Clear Search`.
  - `issuectl-mac-evidence-prs-empty-recovery.png` showed an impossible PR search producing `No Matching Pull Requests` with `Clear Search`.
  - `issuectl-mac-evidence-sessions-empty-recovery.png` showed an impossible Active/Sessions search producing `No Matching Sessions` with `Clear Search`.
- Spaces dogfood attempt:
  - `defaults read com.apple.spaces` showed two existing Spaces on the main display, so no new desktop was created.
  - `issuectl-spaces-dogfood-desktop1-status-menu.png` showed the app reporting `Current Desktop: Desktop 1`.
  - `issuectl-spaces-dogfood-after-control-right-status-menu.png` showed the app reporting `Current Desktop: Desktop 2` after Control-Right.
  - Desktop 2 was configured with distinct PR and Sessions filters using real keystrokes, and its Issues filter was later corrected to the `Running` count chip. `issuectl-spaces-dogfood-roundtrip-d2-issues-running.png` showed Desktop 2 restoring the `Running` issue filter after a Desktop 2 -> Desktop 1 -> Desktop 2 round trip.
  - Desktop 1 received distinct Issues, PR, and Sessions filter text, but the first PR/Sessions setup used accessibility value assignment that changed visible text without reliably driving SwiftUI filter state. A later real-keystroke correction produced `issuectl-spaces-dogfood-d1-sessions-d1-keyed-2.png`, but the final Desktop 1 -> Desktop 2 -> Desktop 1 -> Desktop 2 sequence was not clean enough to close the blocker.
- Clean two-desktop Spaces dogfood replacement evidence:
  - Used the built Debug Mac app directly with `ISSUECTL_UI_TESTING=1`, `ISSUECTL_MAC_UI_FIXTURE_API=1`, `ISSUECTL_SERVER_URL=http://issuectl-ui-test.local`, and `ISSUECTL_API_TOKEN=mac-ui-smoke-token`.
  - Used the two existing main-display macOS Spaces. Keyboard Space switching was inconsistent, so Mission Control was opened and the Desktop thumbnails were clicked for the verification transitions.
  - Configured Desktop 1 with real UI actions:
    - Issues: `Running` count chip selected, captured in `/tmp/issuectl-spaces-clean-d1-issues-running-2.png`.
    - Pull Requests: search field focused through accessibility and typed via real keystrokes as `d1-pr`, captured in `/tmp/issuectl-spaces-clean-d1-pr-d1-pr-4.png`.
    - Active/Sessions: search field focused through accessibility and typed via real keystrokes as `d1-session`, captured in `/tmp/issuectl-spaces-clean-d1-active-d1-session.png`.
  - Configured Desktop 2 with real UI actions:
    - Issues: `Unassigned` count chip selected, captured in `/tmp/issuectl-spaces-clean-d2-issues-unassigned.png`.
    - Pull Requests: search field focused through accessibility and typed via real keystrokes as `d2-pr`, captured in `/tmp/issuectl-spaces-clean-d2-pr-d2-pr.png`.
    - Active/Sessions: search field focused through accessibility and typed via real keystrokes as `d2-session`, captured in `/tmp/issuectl-spaces-clean-d2-active-d2-session.png`.
  - Verified Desktop 2 -> Desktop 1 restore:
    - `/tmp/issuectl-spaces-clean-restore-d1-issues.png` showed Desktop 1 restoring `Running`.
    - `/tmp/issuectl-spaces-clean-restore-d1-pr.png` showed Desktop 1 restoring `d1-pr`.
    - `/tmp/issuectl-spaces-clean-restore-d1-active.png` showed Desktop 1 restoring `d1-session`.
  - Verified Desktop 1 -> Desktop 2 restore:
    - `/tmp/issuectl-spaces-clean-restore-d2-issues.png` showed Desktop 2 restoring `Unassigned`.
    - `/tmp/issuectl-spaces-clean-restore-d2-pr.png` showed Desktop 2 restoring `d2-pr`.
    - `/tmp/issuectl-spaces-clean-restore-d2-active.png` showed Desktop 2 restoring `d2-session`.

## Blocker

Resolved by the clean two-desktop manual dogfood receipt above.

## Required Manual Or Local Evidence

Before final completion, collect one of:

- Completed in this receipt: a complete manual dogfood receipt for two macOS desktops:
  1. Desktop 1 has distinct Issues, Pull Requests, and Sessions filters.
  2. Desktop 2 has different Issues, Pull Requests, and Sessions filters.
  3. Switching Desktop 1 -> Desktop 2 -> Desktop 1 -> Desktop 2 restores the correct filters each time.
- Completed in this receipt: focused UI smoke or manual replacement evidence for:
  - Completed in this receipt: sidebar filter/count interactions, status menu/header changes, panel hide/show/collapse, collapsed rail badges/offline state, filtered empty recovery actions, and settings repository local-folder chooser.

## Next Step

Run final board validation and completion audit.

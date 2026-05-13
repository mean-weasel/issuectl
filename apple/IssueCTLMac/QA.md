# IssueCTLMac Sidebar Manual QA

Use this checklist for manual regression passes on the native macOS sidebar. Run against a local `issuectl web` server with at least one tracked repo, one open issue, and a valid API token.

## Build And Launch

- [ ] From the repo root, build the macOS target:
  `xcodebuild -project apple/IssueCTL.xcodeproj -scheme IssueCTLMac -destination 'platform=macOS' build`
- [ ] Launch `IssueCTLMac` from Xcode with the `IssueCTLMac` scheme.
- [ ] Confirm the app starts as a menu bar/accessory app, without a Dock window.
- [ ] Confirm the IssueCTL sidebar appears automatically on launch.
- [ ] Confirm the sidebar is positioned on the right side of the visible screen with usable height.
- [ ] Open the IssueCTL menu bar item and verify these menu commands are present: Toggle Sidebar, Collapse Sidebar or Expand Sidebar, Hide Sidebar, Settings, Quit IssueCTL.
- [ ] Open the IssueCTL menu bar item, choose Settings, and confirm the Settings window appears in front.
- [ ] Use Quit IssueCTL and confirm the app exits cleanly.

## Spaces And Window Behavior

- [ ] With the sidebar visible, switch to another Space and confirm the sidebar remains visible there.
- [ ] Enter a full-screen app Space and confirm the sidebar can appear as an auxiliary floating panel.
- [ ] Move focus to another app and confirm the sidebar does not hide just because IssueCTL lost focus.
- [ ] Verify the sidebar stays stationary when switching Spaces and does not jump to a different screen edge.
- [ ] If using multiple displays, show the sidebar and confirm it opens on the active main screen without covering the menu bar.

## Visibility And Collapse

- [ ] Click the header Hide Sidebar button and confirm the panel disappears.
- [ ] Use the menu bar Toggle Sidebar command and confirm the panel reappears.
- [ ] Use Escape while the sidebar has focus and confirm the panel hides.
- [ ] Click the header Collapse Sidebar button and confirm the panel animates to the narrow rail.
- [ ] In collapsed mode, verify the rail shows Issues, Drafts, Active, Refresh, Expand Sidebar, and Hide Sidebar controls.
- [ ] Select each collapsed rail section and confirm the selected icon highlight moves.
- [ ] Click Expand Sidebar and confirm the full sidebar returns.
- [ ] Resize the expanded sidebar narrower and wider; confirm it respects the min and max width limits.
- [ ] Collapse and expand after resizing; confirm the previous expanded width is restored.

## Persistence

- [ ] Select Drafts, quit the app, relaunch, and confirm Drafts remains selected.
- [ ] Select Active, quit the app, relaunch, and confirm Active remains selected.
- [ ] Collapse the sidebar, quit the app, relaunch, and confirm it opens collapsed.
- [ ] Expand the sidebar, resize it, quit the app, relaunch, and confirm the saved width is restored.
- [ ] Open Settings, use Reset Sidebar Layout, and confirm the sidebar expands, selects Issues, and returns to the default width.

## Settings

- [ ] Open the app Settings window.
- [ ] In Connection, verify the server URL displays when configured.
- [ ] In Connection, verify the API token status changes from not saved to saved after connecting.
- [ ] Toggle Launch at Login on and confirm no error is shown.
- [ ] Toggle Launch at Login off and confirm no error is shown.
- [ ] Toggle Open Collapsed on Next Launch on, relaunch, and confirm the sidebar starts collapsed.
- [ ] Toggle Open Collapsed on Next Launch off, relaunch, and confirm the sidebar starts expanded.
- [ ] Resize the expanded sidebar and confirm Saved Width updates in Settings.
- [ ] Click Reset Sidebar Layout and confirm the sidebar state changes immediately.

## Connection

- [ ] Start the server with `issuectl web` and copy the printed API token.
- [ ] Launch the macOS app with no saved connection and confirm the connection form appears.
- [ ] Enter an invalid server URL or token and confirm an inline error appears.
- [ ] After a failed connection, confirm Retry Connect is visible and reuses the entered URL/token.
- [ ] Enter `http://localhost:3847` and a valid API token, then click Connect.
- [ ] Confirm the dashboard replaces the connection form after a successful health check.
- [ ] Confirm the toolbar summary shows issue, draft, and active session counts.
- [ ] Click Refresh and confirm loading state appears without duplicating rows.
- [ ] Use Disconnect from the header and confirm the sidebar returns to the connection form and clears loaded data.
- [ ] Stop `issuectl web`, refresh, and confirm the sidebar reports a useful connection/load error without crashing.
- [ ] Restart `issuectl web`, use Retry from the dashboard error banner, and confirm the sidebar reloads.

## Issues And Actions

- [ ] Open the Issues tab and confirm open issues load for tracked repos.
- [ ] Verify the Open, Unassigned, and All filters update the visible list.
- [ ] Search by issue title and confirm matching rows remain.
- [ ] Search by repo full name and confirm matching rows remain.
- [ ] Open an issue row and confirm the detail sheet loads title, repo, issue number, labels, assignees, body, and comments.
- [ ] Simulate an issue detail load failure and confirm the detail sheet shows Retry without closing.
- [ ] In the issue detail sheet, click Refresh and confirm the loading state completes.
- [ ] Change Priority and confirm the badge updates, then refresh and confirm the persisted priority is shown.
- [ ] Add a comment and confirm the composer clears and the comment appears after reload.
- [ ] Close an open issue and confirm the state badge updates.
- [ ] Reopen the issue and confirm the state badge updates.
- [ ] Click GitHub and confirm the issue opens in the browser.
- [ ] Close the detail sheet and confirm the sidebar remains usable.

## Drafts

- [ ] Open the Drafts tab and confirm the empty state appears when there are no drafts.
- [ ] Click New Draft from the empty state or toolbar.
- [ ] Confirm Create is disabled until a title is entered.
- [ ] Create a draft with title, body, and High priority.
- [ ] Confirm the draft appears in the list with title, body preview, created time, and priority pill.
- [ ] Open the draft, edit the title/body/priority, save, and confirm the list updates.
- [ ] Right-click a draft and choose Edit; confirm the editor opens for that draft.
- [ ] Right-click a draft and choose Delete; cancel the confirmation and confirm the draft remains.
- [ ] Delete the draft and confirm it disappears from the list.
- [ ] Simulate a server error while saving or deleting and confirm the error is shown without dismissing the current context unexpectedly.

## Sessions And Terminal

- [ ] Open an issue with no active session and confirm the launch section shows Ready to Launch.
- [ ] Click Launch and confirm the button shows progress while the request is in flight.
- [ ] Confirm the issue row shows the terminal/running indicator after a session starts.
- [ ] In the issue detail sheet, confirm Session Starting appears while terminal setup is pending.
- [ ] When terminal setup is ready, click Open and confirm the browser opens the terminal URL.
- [ ] Open the Active tab and confirm the active session row shows repo, issue number, branch, duration, workspace path, and Ready or Starting.
- [ ] Click the Active tab Refresh control and confirm session state updates.
- [ ] Simulate an Active tab refresh/open/end failure and confirm Retry Refresh is shown without dismissing the tab.
- [ ] Click Open on a ready session and confirm the terminal opens.
- [ ] Click End, confirm the progress state appears, and confirm the ended session is removed from the Active list.
- [ ] Confirm launching a second time for the same issue reuses the existing active session instead of creating a duplicate.

## Known Backlog

- [ ] Global hotkey to show/hide the sidebar.
- [ ] Keyboard navigation for switching sections, selecting rows, opening details, and activating primary actions.
- [ ] Automated UI coverage for native macOS sidebar visibility, collapse state, and persistence.
- [ ] Multi-display placement preferences beyond the current main-screen default.
- [ ] Additional recovery actions for draft save and session terminal failures.

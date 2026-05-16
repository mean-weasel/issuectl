# T061 Phase 9B Branch Start

Date: 2026-05-14

Branch: `mac-parity-phase-9b-offline-queue`
Base: `mac-sidebar-spaces-option-a`

Objective: implement the Phase 9B Mac offline queue foundation selected by T060.

Initial scope:

- Wire existing offline sync service and queue store into the Mac app.
- Queue issue comments and close/reopen actions on queueable network failures.
- Expose pending/failed queue status plus basic sync/retry/clear/remove controls.
- Add deterministic unit and UI coverage for queue visibility and replay behavior.

Excluded from this branch:

- Notifications.
- Today/Attention surface.
- New queue formats or broad reliability refactors.

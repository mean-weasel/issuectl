# T056 Worker Start: Phase 8D Terminal Window

Date: 2026-05-14

Branch: `mac-parity-phase-8d-terminal-window`

Base: `mac-sidebar-spaces-option-a`

Planned slice:

- Add a native embedded Mac terminal surface opened from issue detail and Active Sessions.
- Reuse the existing `ensureTtyd` terminal access path and token URL.
- Add loading, failure, reconnect/respawn, text-size, duration, and end-session controls.
- Add focused unit/UI coverage and fixture support for deterministic validation.

Out of scope:

- Offline/cache parity beyond existing session cache banner.
- Notifications and Today extension parity.
- Per-Space desktop filter behavior.
- Backend API changes beyond fixture support.

# Terminal Session Diagnostics UI

## Original Request

Plan the next slice for adding lightweight terminal diagnostics and session status visibility to the workbench.

## Outcome

Add a small, useful diagnostics/status surface for issue launch terminal sessions so maintainers can quickly see whether a session is using TTYD or the PTY bridge, understand the current attach/connection state, and jump to or copy the right diagnostics command when something goes wrong.

## Oracle

The tranche is complete only when current evidence proves:

- terminal/session UI shows the backend clearly: `TTYD` or `PTY bridge`;
- a live PTY bridge session shows a correct connected/attached status while usable;
- TTYD sessions still render with a correct backend/status indicator;
- the UI exposes a low-friction diagnostics affordance for the relevant deployment ID, such as copying `issuectl diag show --deployment <id>`;
- diagnostics-first debugging remains documented and aligned with `AGENTS.md`;
- focused automated tests cover PTY and TTYD status display plus diagnostics command behavior;
- Playwright evidence against a local server proves the UI is visible, readable, and not cluttered in desktop and compact layouts;
- manual QA against the approved issuectl test repos confirms launch, navigate away/back, reconnect, and close behavior still works.

## Constraints

- Keep PTY bridge feature-flagged behind `ISSUECTL_PTY_BRIDGE=1`.
- Restrict real issue launch/manual QA to the approved issuectl test repositories.
- Prefer the smallest read-only diagnostics surface before building a full diagnostics browser.
- Do not add a new backend API unless Scout proves the workbench cannot get enough useful state from existing deployment data, terminal lifecycle state, and copyable CLI commands.
- Preserve TTYD as the default path unless a separate rollout decision changes it.

## Likely Misfire

The likely wrong solution is overbuilding a diagnostics dashboard before proving that a compact backend/status/command affordance helps real debugging. Another likely miss is showing static backend labels without proving they match live terminal connection state in Playwright and diagnostics.

## Enough For This Tranche

This tranche is enough when a maintainer launching a test issue can immediately tell which terminal backend is active, whether the terminal is connected/attached, and what diagnostics command to run for the deployment, with tests and Playwright evidence proving the behavior.

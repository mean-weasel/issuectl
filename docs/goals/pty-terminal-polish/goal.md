# PTY Terminal Polish

## Original Request

Organize the PTY terminal styling and status reconciliation work with GoalBuddy. Be rigorous: every fix must be confirmed with Playwright CLI, and "everything looks correct" is explicit acceptance criteria for each improvement step.

## Outcome

Improve the feature-flagged PTY bridge terminal experience so the live terminal and surrounding workbench UI look correct and report correct session state after a real local PTY connection.

## Oracle

The tranche is complete only when Playwright CLI evidence against the local `ISSUECTL_PTY_BRIDGE=1` server proves:

- the PTY terminal is connected and usable;
- the session card status matches the live connected terminal state;
- terminal frame, padding, contrast, prompt, header, and responsive layout look correct in screenshots;
- no page or console errors occur;
- diagnostics for the relevant deployment show a clean PTY lifecycle including `pty.ws_connected`, `pty.bridge_attached`, and `pty.first_output_seen`;
- focused automated tests, typecheck, and lint pass.

## Constraints

- Use only approved issuectl test repositories for real launch or reconnect verification.
- Keep work scoped to the web workbench/PT terminal UI and tests unless Scout/Judge proves another file is required.
- Every Worker task must include Playwright CLI visual confirmation as an acceptance criterion.
- Do not mark this done with tests alone; final proof must include screenshot paths and a visual QA receipt.
- Preserve the currently running local PTY bridge server when useful, but do not depend on unstable browser tab state.

## Likely Misfire

The biggest failure mode is making a code or test change that passes but still leaves the live PTY terminal looking wrong, the session card saying unavailable, or the Playwright screenshot showing clipped/low-contrast terminal content.

## Enough For This Tranche

The current PTY bridge terminal polish is enough when a final Judge/PM audit maps code changes, diagnostics, focused tests, and before/after Playwright screenshots to the oracle above.

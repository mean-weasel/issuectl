import { describe, expect, it, vi } from "vitest";
import type { DiagnosticEvent } from "@issuectl/core";
import { summarizeBackends } from "./diag-summary.js";

function makeEvent(overrides: Partial<DiagnosticEvent> = {}): DiagnosticEvent {
  return {
    id: 1,
    timestamp: Date.UTC(2026, 4, 20, 12, 0, 0),
    level: "info",
    event: "test.event",
    source: "test",
    correlationId: null,
    owner: null,
    repo: null,
    issueNumber: null,
    targetType: null,
    targetNumber: null,
    deploymentId: null,
    sessionName: null,
    ttydPort: null,
    ttydPid: null,
    status: null,
    message: null,
    data: null,
    ...overrides,
  };
}

describe("summarizeBackends", () => {
  it("summarizes diagnostics by inferred backend", () => {
    const db = {
      prepare: vi.fn(() => ({
        get: vi.fn(() => ({ terminal_backend: "pty_bridge" })),
      })),
    };

    expect(summarizeBackends([
      makeEvent({ event: "deployment.activated", deploymentId: 7 }),
      makeEvent({ event: "pty.first_output_seen", deploymentId: 7 }),
      makeEvent({ event: "terminal.first_output_seen", deploymentId: 8 }),
      makeEvent({ event: "ensure_ttyd.failed", level: "error", deploymentId: 8 }),
    ], db)).toEqual([
      {
        backend: "pty_bridge",
        events: 2,
        launches: 0,
        activations: 1,
        firstOutput: 1,
        reconnects: 0,
        failures: 0,
        cleanups: 0,
      },
      {
        backend: "ttyd",
        events: 2,
        launches: 0,
        activations: 0,
        firstOutput: 1,
        reconnects: 0,
        failures: 1,
        cleanups: 0,
      },
    ]);
  });
});

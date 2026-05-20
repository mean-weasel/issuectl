import { Command, CommanderError } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatDiagnosticEvent,
  parseDurationMs,
  parseIssueRef,
  registerDiagCommands,
} from "./diag.js";
import type { DiagnosticEvent } from "@issuectl/core";
import {
  getDiagnosticTimeline,
  queryDiagnosticEvents,
} from "@issuectl/core";
import { requireDb } from "../utils/db.js";

vi.mock("@issuectl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@issuectl/core")>();
  return {
    ...actual,
    getDiagnosticTimeline: vi.fn(),
    queryDiagnosticEvents: vi.fn(),
  };
});

vi.mock("../utils/db.js", () => ({
  requireDb: vi.fn(),
}));

const mockDb = {};

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

function createProgram(): { program: Command; stderr: () => string; stdout: () => string } {
  let stderr = "";
  let stdout = "";
  const program = new Command();
  program
    .name("issuectl")
    .exitOverride()
    .configureOutput({
      writeErr: (value) => {
        stderr += value;
      },
      writeOut: (value) => {
        stdout += value;
      },
    });

  registerDiagCommands(program);

  return {
    program,
    stderr: () => stderr,
    stdout: () => stdout,
  };
}

async function parseCommand(args: string[]): Promise<{
  error?: unknown;
  stderr: string;
  stdout: string;
}> {
  const { program, stderr, stdout } = createProgram();
  let processStdout = "";
  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
    processStdout += String(value);
    return true;
  });

  try {
    await program.parseAsync(args, { from: "user" });
    return { stderr: stderr(), stdout: stdout() + processStdout };
  } catch (error) {
    return {
      error,
      stderr: stderr(),
      stdout: stdout() + processStdout,
    };
  } finally {
    writeSpy.mockRestore();
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-20T12:00:00.000Z"));
  vi.mocked(requireDb).mockReset();
  vi.mocked(requireDb).mockReturnValue(mockDb as never);
  vi.mocked(queryDiagnosticEvents).mockReset();
  vi.mocked(getDiagnosticTimeline).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("diag command helpers", () => {
  it("parses duration values", () => {
    expect(parseDurationMs("15m")).toBe(15 * 60 * 1000);
    expect(parseDurationMs("2h")).toBe(2 * 60 * 60 * 1000);
    expect(parseDurationMs("1d")).toBe(24 * 60 * 60 * 1000);
  });

  it("parses issue references", () => {
    expect(parseIssueRef("mean-weasel/issuectl-test-repo#152")).toEqual({
      owner: "mean-weasel",
      repo: "issuectl-test-repo",
      issueNumber: 152,
    });
  });

  it("formats diagnostic events for human-readable output", () => {
    const event: DiagnosticEvent = {
      id: 1,
      timestamp: Date.UTC(2026, 4, 20, 12, 0, 0),
      level: "error",
      event: "ensure_ttyd.failed",
      source: "test",
      correlationId: "launch-abc",
      owner: "mean-weasel",
      repo: "issuectl-test-repo",
      issueNumber: 152,
      deploymentId: 100,
      sessionName: null,
      ttydPort: null,
      ttydPid: null,
      status: null,
      message: "Deployment not found or already ended",
      data: null,
    };

    const line = formatDiagnosticEvent(event);

    expect(line).toContain("ensure_ttyd.failed");
    expect(line).toContain("deployment=100");
    expect(line).toContain("mean-weasel/issuectl-test-repo#152");
    expect(line).toContain("Deployment not found or already ended");
  });
});

describe("diag commands", () => {
  it("tail calls queryDiagnosticEvents with the default since and filters", async () => {
    vi.mocked(queryDiagnosticEvents).mockReturnValue([makeEvent()]);

    await parseCommand([
      "diag",
      "tail",
      "--issue",
      "mean-weasel/issuectl-test-repo#152",
      "--deployment",
      "100",
      "--event",
      "ensure_ttyd.failed",
      "workbench.opened",
      "--level",
      "warn",
      "error",
      "--correlation",
      "launch-abc",
      "--limit",
      "25",
    ]);

    expect(queryDiagnosticEvents).toHaveBeenCalledWith(mockDb, {
      since: Date.UTC(2026, 4, 20, 11, 45, 0),
      limit: 25,
      issue: {
        owner: "mean-weasel",
        repo: "issuectl-test-repo",
        issueNumber: 152,
      },
      deploymentId: 100,
      correlationId: "launch-abc",
      events: ["ensure_ttyd.failed", "workbench.opened"],
      levels: ["warn", "error"],
    });
  });

  it("show calls getDiagnosticTimeline and prints JSON", async () => {
    const events = [makeEvent({ event: "timeline.event", message: "ready" })];
    vi.mocked(getDiagnosticTimeline).mockReturnValue(events);

    const result = await parseCommand([
      "diag",
      "show",
      "--issue",
      "mean-weasel/issuectl-test-repo#152",
      "--limit",
      "5",
      "--json",
    ]);

    expect(getDiagnosticTimeline).toHaveBeenCalledWith(mockDb, {
      limit: 5,
      issue: {
        owner: "mean-weasel",
        repo: "issuectl-test-repo",
        issueNumber: 152,
      },
    });
    expect(JSON.parse(result.stdout)).toEqual(events);
  });

  it("invalid since exits through Commander without stack trace output", async () => {
    const result = await parseCommand(["diag", "tail", "--since", "yesterday"]);

    expect(result.error).toBeInstanceOf(CommanderError);
    expect(result.stderr).toContain("Invalid duration.");
    expect(result.stderr).not.toContain("at ");
    expect(queryDiagnosticEvents).not.toHaveBeenCalled();
    expect(requireDb).not.toHaveBeenCalled();
  });

  it("invalid issue exits through Commander without stack trace output", async () => {
    const result = await parseCommand(["diag", "show", "--issue", "bad-issue"]);

    expect(result.error).toBeInstanceOf(CommanderError);
    expect(result.stderr).toContain("Invalid issue ref.");
    expect(result.stderr).not.toContain("at ");
    expect(getDiagnosticTimeline).not.toHaveBeenCalled();
    expect(requireDb).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "deployment",
      args: ["diag", "tail", "--deployment", "abc"],
      message: "--deployment must be a positive integer.",
    },
    {
      name: "limit",
      args: ["diag", "tail", "--limit", "0"],
      message: "--limit must be a positive integer.",
    },
    {
      name: "until",
      args: ["diag", "list", "--until", "May 20, 2026"],
      message: "--until must be a valid ISO timestamp.",
    },
    {
      name: "impossible until date",
      args: ["diag", "list", "--until", "2026-02-31T00:00:00Z"],
      message: "--until must be a valid ISO timestamp.",
    },
    {
      name: "impossible until time",
      args: ["diag", "list", "--until", "2026-01-01T24:00:00Z"],
      message: "--until must be a valid ISO timestamp.",
    },
    {
      name: "level",
      args: ["diag", "tail", "--level", "fatal"],
      message: 'Invalid level "fatal". Use one of: debug, info, warn, error.',
    },
  ])("invalid $name exits through Commander before querying", async ({ args, message }) => {
    const result = await parseCommand(args);

    expect(result.error).toBeInstanceOf(CommanderError);
    expect(result.stderr).toContain(message);
    expect(result.stderr).not.toContain("at ");
    expect(queryDiagnosticEvents).not.toHaveBeenCalled();
    expect(getDiagnosticTimeline).not.toHaveBeenCalled();
    expect(requireDb).not.toHaveBeenCalled();
  });
});

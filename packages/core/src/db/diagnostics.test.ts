import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDiagnosticTimeline,
  queryDiagnosticEvents,
  recordDiagnosticEvent,
  recordDiagnosticEventSafely,
} from "./diagnostics.js";
import { runMigrations } from "./migrations.js";
import { initSchema } from "./schema.js";

describe("diagnostic events", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    initSchema(db);
    runMigrations(db);
  });

  it("records structured diagnostic events with searchable fields", () => {
    const id = recordDiagnosticEvent(db, {
      level: "info",
      event: "launch.requested",
      source: "api.launch",
      owner: "mean-weasel",
      repo: "issuectl-test-repo",
      issueNumber: 152,
      targetType: "issue",
      targetNumber: 152,
      deploymentId: 100,
      correlationId: "launch-abc",
      message: "Launch requested",
      data: { branchName: "issue-152-test", agent: "codex" },
    });

    expect(id).toBeGreaterThan(0);
    const rows = queryDiagnosticEvents(db, {
      issue: {
        owner: "mean-weasel",
        repo: "issuectl-test-repo",
        issueNumber: 152,
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      level: "info",
      event: "launch.requested",
      source: "api.launch",
      owner: "mean-weasel",
      repo: "issuectl-test-repo",
      issueNumber: 152,
      deploymentId: 100,
      correlationId: "launch-abc",
      message: "Launch requested",
    });
    expect(rows[0]?.data).toEqual({
      branchName: "issue-152-test",
      agent: "codex",
    });
  });

  it("records and filters PR target diagnostics", () => {
    recordDiagnosticEvent(db, {
      level: "warn",
      event: "liveness.tmux_missing",
      source: "web.idle-checker",
      owner: "mean-weasel",
      repo: "issuectl-test-repo",
      targetType: "pr",
      targetNumber: 506,
      deploymentId: 200,
    });

    const rows = queryDiagnosticEvents(db, {
      target: {
        owner: "mean-weasel",
        repo: "issuectl-test-repo",
        targetType: "pr",
        targetNumber: 506,
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event: "liveness.tmux_missing",
      issueNumber: null,
      targetType: "pr",
      targetNumber: 506,
      deploymentId: 200,
    });
  });

  it("filters by deployment, event, level, and since timestamp", () => {
    recordDiagnosticEvent(db, {
      timestamp: 1_000,
      level: "info",
      event: "launch.requested",
      source: "test",
      deploymentId: 100,
    });
    recordDiagnosticEvent(db, {
      timestamp: 2_000,
      level: "error",
      event: "ensure_ttyd.failed",
      source: "test",
      deploymentId: 100,
      message: "Deployment not found or already ended",
    });
    recordDiagnosticEvent(db, {
      timestamp: 3_000,
      level: "warn",
      event: "launch.requested",
      source: "test",
      deploymentId: 101,
    });

    const rows = queryDiagnosticEvents(db, {
      deploymentId: 100,
      events: ["ensure_ttyd.failed"],
      levels: ["error"],
      since: 1_500,
    });

    expect(rows.map((row) => row.event)).toEqual(["ensure_ttyd.failed"]);
  });

  it("returns timeline rows in ascending order", () => {
    recordDiagnosticEvent(db, {
      timestamp: 3_000,
      level: "info",
      event: "c",
      source: "test",
      deploymentId: 100,
    });
    recordDiagnosticEvent(db, {
      timestamp: 1_000,
      level: "info",
      event: "a",
      source: "test",
      deploymentId: 100,
    });
    recordDiagnosticEvent(db, {
      timestamp: 2_000,
      level: "info",
      event: "b",
      source: "test",
      deploymentId: 100,
    });

    const rows = getDiagnosticTimeline(db, { deploymentId: 100 });

    expect(rows.map((row) => row.event)).toEqual(["a", "b", "c"]);
  });

  it("returns undefined instead of throwing when safe recording fails", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const closedDb = new Database(":memory:");
    closedDb.close();

    expect(
      recordDiagnosticEventSafely(closedDb, {
        level: "info",
        event: "safe.failure",
        source: "test",
      }),
    ).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      "[issuectl] Failed to record diagnostic event:",
      expect.any(Error),
    );

    warnSpy.mockRestore();
  });
});

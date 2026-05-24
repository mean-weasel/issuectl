import { describe, expect, it } from "vitest";
import { createRawTestDb } from "./test-helpers.js";
import { getSchemaVersion } from "./schema.js";
import { runMigrations } from "./migrations.js";

describe("schema v19 — deployment target migration", () => {
  it("preserves issue deployments referenced by webhook intents", () => {
    const db = createRawTestDb();
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (18);
      CREATE TABLE repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        UNIQUE(owner, name)
      );
      CREATE TABLE deployments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        issue_number INTEGER NOT NULL,
        agent TEXT NOT NULL DEFAULT 'claude' CHECK (agent IN ('claude', 'codex')),
        branch_name TEXT NOT NULL,
        workspace_mode TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        linked_pr_number INTEGER,
        state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('pending', 'active')),
        terminal_backend TEXT NOT NULL DEFAULT 'ttyd' CHECK (terminal_backend IN ('ttyd', 'pty_bridge')),
        triggered_by TEXT NOT NULL DEFAULT 'manual' CHECK (triggered_by IN ('manual', 'webhook', 'comment_command')),
        launched_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        terminal_reason TEXT CHECK (terminal_reason IN ('completed', 'failed', 'ended_manual', 'killed_by_label', 'closed', 'timeout', 'liveness_missing') OR terminal_reason IS NULL),
        completion_token TEXT,
        completion_result_json TEXT,
        notification_sent_at TEXT,
        ttyd_port INTEGER,
        ttyd_pid INTEGER,
        idle_since TEXT
      );
      CREATE UNIQUE INDEX idx_deployments_live
        ON deployments(repo_id, issue_number)
        WHERE ended_at IS NULL;
      CREATE TABLE webhook_intents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK (target_type IN ('issue', 'pr')),
        target_number INTEGER NOT NULL,
        first_signal_at INTEGER NOT NULL,
        last_signal_at INTEGER NOT NULL,
        scheduled_at INTEGER NOT NULL,
        generation INTEGER NOT NULL DEFAULT 1,
        signal_count INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'processing', 'deferred', 'launched', 'skipped_locked', 'skipped_optout', 'expired', 'failed')),
        deployment_id INTEGER REFERENCES deployments(id)
      );
      INSERT INTO repos (owner, name) VALUES ('o', 'n');
      INSERT INTO deployments (repo_id, issue_number, branch_name, workspace_mode, workspace_path, triggered_by)
        VALUES (1, 42, 'issue-42', 'existing', '/x', 'webhook');
      INSERT INTO webhook_intents (
        repo_id, target_type, target_number, first_signal_at, last_signal_at,
        scheduled_at, status, deployment_id
      ) VALUES (1, 'issue', 42, 1, 1, 1, 'launched', 1);
    `);

    runMigrations(db);

    expect(getSchemaVersion(db)).toBe(24);
    const deployment = db
      .prepare("SELECT issue_number, target_type, target_number FROM deployments WHERE id = 1")
      .get() as { issue_number: number | null; target_type: string; target_number: number };
    expect(deployment).toEqual({
      issue_number: 42,
      target_type: "issue",
      target_number: 42,
    });
    expect(
      (db.prepare("SELECT deployment_id FROM webhook_intents WHERE id = 1").get() as { deployment_id: number })
        .deployment_id,
    ).toBe(1);
    expect(() =>
      db.prepare(
        "INSERT INTO deployments (repo_id, issue_number, target_type, target_number, branch_name, workspace_mode, workspace_path) VALUES (1, NULL, 'pr', 42, 'pr-42', 'existing', '/pr')",
      ).run(),
    ).not.toThrow();
  });
});

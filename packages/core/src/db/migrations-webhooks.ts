import type Database from "better-sqlite3";

export function runWebhookMigration(db: Database.Database): void {
  if (hasTable(db, "repos")) {
    db.exec(`
      ALTER TABLE repos ADD COLUMN auto_launch_issues INTEGER NOT NULL DEFAULT 0 CHECK (auto_launch_issues IN (0, 1));
      ALTER TABLE repos ADD COLUMN auto_review_prs INTEGER NOT NULL DEFAULT 0 CHECK (auto_review_prs IN (0, 1));
      ALTER TABLE repos ADD COLUMN issue_agent TEXT NOT NULL DEFAULT 'codex' CHECK (issue_agent IN ('claude', 'codex'));
      ALTER TABLE repos ADD COLUMN review_agent TEXT NOT NULL DEFAULT 'claude' CHECK (review_agent IN ('claude', 'codex'));
      ALTER TABLE repos ADD COLUMN webhook_secret TEXT;
      ALTER TABLE repos ADD COLUMN webhook_id INTEGER;
      ALTER TABLE repos ADD COLUMN review_preamble TEXT;
      ALTER TABLE repos ADD COLUMN webhook_payload_mode TEXT NOT NULL DEFAULT 'metadata' CHECK (webhook_payload_mode IN ('metadata', 'raw'));
    `);
  }

  if (hasTable(db, "deployments")) {
    db.exec(`
      ALTER TABLE deployments ADD COLUMN triggered_by TEXT NOT NULL DEFAULT 'manual'
        CHECK (triggered_by IN ('manual', 'webhook', 'comment_command'));
    `);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      delivery_id    TEXT PRIMARY KEY,
      repo_id        INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      event_type     TEXT NOT NULL,
      received_at    INTEGER NOT NULL,
      retained_until INTEGER
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_id   TEXT NOT NULL UNIQUE REFERENCES webhook_deliveries(delivery_id),
      repo_id       INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      event_type    TEXT NOT NULL,
      action        TEXT,
      sender_login  TEXT,
      target_type   TEXT CHECK (target_type IN ('issue', 'pr') OR target_type IS NULL),
      target_number INTEGER,
      payload_json  TEXT,
      received_at   INTEGER NOT NULL,
      intent_id     INTEGER REFERENCES webhook_intents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_events_target
      ON webhook_events(repo_id, target_type, target_number);

    CREATE TABLE IF NOT EXISTS webhook_intents (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id               INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      target_type           TEXT NOT NULL CHECK (target_type IN ('issue', 'pr')),
      target_number         INTEGER NOT NULL,
      first_signal_at       INTEGER NOT NULL,
      last_signal_at        INTEGER NOT NULL,
      scheduled_at          INTEGER NOT NULL,
      processing_started_at INTEGER,
      lease_expires_at      INTEGER,
      generation            INTEGER NOT NULL DEFAULT 1,
      desired_head_sha      TEXT,
      requested_agent       TEXT CHECK (requested_agent IN ('claude', 'codex') OR requested_agent IS NULL),
      review_mode           TEXT CHECK (review_mode IN ('auto', 'full') OR review_mode IS NULL),
      signal_count          INTEGER NOT NULL DEFAULT 1,
      status                TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'processing', 'deferred', 'launched', 'skipped_locked', 'skipped_optout', 'expired', 'failed')),
      resolved_at           INTEGER,
      deployment_id         INTEGER REFERENCES deployments(id),
      failure_reason        TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_intents_active_target
      ON webhook_intents(repo_id, target_type, target_number)
      WHERE status IN ('pending', 'processing', 'deferred');
  `);

  const insert = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  );
  insert.run("webhook_debounce_seconds", "60");
  insert.run("webhook_max_debounce_seconds", "300");
  insert.run("max_webhook_launches_per_minute", "5");
  insert.run("max_webhook_queue_depth", "100");
  insert.run("max_webhook_intent_age_minutes", "60");
  insert.run("webhook_raw_payload_retention_days", "7");
  insert.run("webhook_event_retention_days", "30");
  insert.run("max_concurrent_webhook_agents", "2");
  insert.run("max_webhook_recursion_depth", "1");
  insert.run("public_webhook_base_url", "");
}

export function runWebhookIntentOptionsMigration(db: Database.Database): void {
  if (!hasTable(db, "webhook_intents")) return;
  if (!hasColumn(db, "webhook_intents", "requested_agent")) {
    db.exec("ALTER TABLE webhook_intents ADD COLUMN requested_agent TEXT CHECK (requested_agent IN ('claude', 'codex') OR requested_agent IS NULL);");
  }
  if (!hasColumn(db, "webhook_intents", "review_mode")) {
    db.exec("ALTER TABLE webhook_intents ADD COLUMN review_mode TEXT CHECK (review_mode IN ('auto', 'full') OR review_mode IS NULL);");
  }
}

export function runDeploymentTerminalMigration(db: Database.Database): void {
  if (!hasTable(db, "deployments")) return;
  db.exec(`
    ALTER TABLE deployments ADD COLUMN terminal_reason TEXT CHECK (terminal_reason IN ('completed', 'failed', 'ended_manual', 'killed_by_label', 'closed', 'timeout', 'liveness_missing') OR terminal_reason IS NULL);
    ALTER TABLE deployments ADD COLUMN completion_token TEXT;
    ALTER TABLE deployments ADD COLUMN completion_result_json TEXT;
    ALTER TABLE deployments ADD COLUMN notification_sent_at TEXT;
  `);
}

export function runDeploymentTargetMigration(db: Database.Database): void {
  if (!hasTable(db, "deployments")) return;
  const hasWebhookIntents = hasTable(db, "webhook_intents");
  if (hasWebhookIntents) {
    db.exec(`
      CREATE TEMP TABLE deployment_target_intent_refs AS
        SELECT id, deployment_id
        FROM webhook_intents
        WHERE deployment_id IS NOT NULL;
      UPDATE webhook_intents
        SET deployment_id = NULL
        WHERE deployment_id IS NOT NULL;
    `);
  }
  db.exec(`
    DROP INDEX IF EXISTS idx_deployments_live;
    CREATE TABLE deployments_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      issue_number INTEGER,
      target_type TEXT NOT NULL DEFAULT 'issue' CHECK (target_type IN ('issue', 'pr')),
      target_number INTEGER NOT NULL,
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

    INSERT INTO deployments_new (
      id, repo_id, issue_number, target_type, target_number, agent,
      branch_name, workspace_mode, workspace_path, linked_pr_number, state,
      terminal_backend, triggered_by, launched_at, ended_at, terminal_reason,
      completion_token, completion_result_json, notification_sent_at, ttyd_port,
      ttyd_pid, idle_since
    )
    SELECT
      id, repo_id, issue_number, 'issue', issue_number, agent,
      branch_name, workspace_mode, workspace_path, linked_pr_number, state,
      terminal_backend, triggered_by, launched_at, ended_at, terminal_reason,
      completion_token, completion_result_json, notification_sent_at, ttyd_port,
      ttyd_pid, idle_since
    FROM deployments;

    DROP TABLE deployments;
    ALTER TABLE deployments_new RENAME TO deployments;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_deployments_live_target
      ON deployments(repo_id, target_type, target_number)
      WHERE ended_at IS NULL;
  `);
  if (hasWebhookIntents) {
    db.exec(`
      UPDATE webhook_intents
        SET deployment_id = (
          SELECT deployment_id
          FROM deployment_target_intent_refs refs
          WHERE refs.id = webhook_intents.id
        )
        WHERE id IN (SELECT id FROM deployment_target_intent_refs);
      DROP TABLE deployment_target_intent_refs;
    `);
  }
}

function hasTable(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(name) as { c: number };
  return row.c > 0;
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

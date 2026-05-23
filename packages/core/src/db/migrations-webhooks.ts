import type Database from "better-sqlite3";

export function runWebhookMigration(db: Database.Database): void {
  if (hasTable(db, "repos")) {
    db.exec(`
      ALTER TABLE repos ADD COLUMN auto_launch_issues INTEGER NOT NULL DEFAULT 0 CHECK (auto_launch_issues IN (0, 1));
      ALTER TABLE repos ADD COLUMN auto_review_prs INTEGER NOT NULL DEFAULT 0 CHECK (auto_review_prs IN (0, 1));
      ALTER TABLE repos ADD COLUMN issue_agent TEXT NOT NULL DEFAULT 'claude' CHECK (issue_agent IN ('claude', 'codex'));
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
  insert.run("max_concurrent_webhook_agents", "2");
  insert.run("public_webhook_base_url", "");
}

function hasTable(db: Database.Database, name: string): boolean {
  const row = db
    .prepare(
      "SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = ?",
    )
    .get(name) as { c: number };
  return row.c > 0;
}

import type Database from "better-sqlite3";

const SCHEMA_VERSION = 22;

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS repos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    owner          TEXT NOT NULL,
    name           TEXT NOT NULL,
    local_path     TEXT,
    branch_pattern TEXT,
    auto_launch_issues INTEGER NOT NULL DEFAULT 0 CHECK (auto_launch_issues IN (0, 1)),
    auto_review_prs    INTEGER NOT NULL DEFAULT 0 CHECK (auto_review_prs IN (0, 1)),
    issue_agent        TEXT NOT NULL DEFAULT 'claude' CHECK (issue_agent IN ('claude', 'codex')),
    review_agent       TEXT NOT NULL DEFAULT 'claude' CHECK (review_agent IN ('claude', 'codex')),
    webhook_secret     TEXT,
    webhook_id         INTEGER,
    review_preamble    TEXT,
    webhook_payload_mode TEXT NOT NULL DEFAULT 'metadata' CHECK (webhook_payload_mode IN ('metadata', 'raw')),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(owner, name)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deployments (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id          INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    issue_number     INTEGER,
    target_type      TEXT NOT NULL DEFAULT 'issue'
                     CHECK (target_type IN ('issue', 'pr')),
    target_number    INTEGER NOT NULL,
    agent            TEXT NOT NULL DEFAULT 'claude'
                     CHECK (agent IN ('claude', 'codex')),
    branch_name      TEXT NOT NULL,
    workspace_mode   TEXT NOT NULL,
    workspace_path   TEXT NOT NULL,
    linked_pr_number INTEGER,
    state            TEXT NOT NULL DEFAULT 'active'
                     CHECK (state IN ('pending', 'active')),
    terminal_backend TEXT NOT NULL DEFAULT 'ttyd'
                     CHECK (terminal_backend IN ('ttyd', 'pty_bridge')),
    triggered_by     TEXT NOT NULL DEFAULT 'manual'
                     CHECK (triggered_by IN ('manual', 'webhook', 'comment_command')),
    parent_deployment_id INTEGER REFERENCES deployments(id) ON DELETE SET NULL,
    webhook_depth    INTEGER NOT NULL DEFAULT 0 CHECK (webhook_depth >= 0),
    launched_at      TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at         TEXT,
    terminal_reason  TEXT
                     CHECK (terminal_reason IN ('completed', 'failed', 'ended_manual', 'killed_by_label', 'closed', 'timeout', 'liveness_missing') OR terminal_reason IS NULL),
    completion_token TEXT,
    completion_result_json TEXT,
    notification_sent_at TEXT,
    ttyd_port        INTEGER,
    ttyd_pid         INTEGER,
    idle_since       TEXT
  );

  CREATE TABLE IF NOT EXISTS cache (
    key        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS drafts (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    priority   TEXT NOT NULL DEFAULT 'normal'
               CHECK (priority IN ('low', 'normal', 'high')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS issue_metadata (
    repo_id      INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    issue_number INTEGER NOT NULL,
    priority     TEXT NOT NULL DEFAULT 'normal'
                 CHECK (priority IN ('low', 'normal', 'high')),
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (repo_id, issue_number)
  );

  CREATE TABLE IF NOT EXISTS action_nonces (
    nonce       TEXT NOT NULL,
    action_type TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'completed', 'failed')),
    result_json TEXT,
    created_at  INTEGER NOT NULL,
    PRIMARY KEY (nonce, action_type)
  );

  CREATE INDEX IF NOT EXISTS idx_action_nonces_created_at
    ON action_nonces(created_at);

  CREATE TABLE IF NOT EXISTS github_accessible_repos (
    owner      TEXT NOT NULL,
    name       TEXT NOT NULL,
    is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
    pushed_at  TEXT,
    synced_at  INTEGER NOT NULL,
    PRIMARY KEY (owner, name)
  );

  CREATE TABLE IF NOT EXISTS push_devices (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    platform                TEXT NOT NULL CHECK (platform IN ('ios')),
    token                   TEXT NOT NULL,
    environment             TEXT NOT NULL DEFAULT 'production'
                            CHECK (environment IN ('development', 'production')),
    idle_terminals          INTEGER NOT NULL DEFAULT 1 CHECK (idle_terminals IN (0, 1)),
    new_issues              INTEGER NOT NULL DEFAULT 1 CHECK (new_issues IN (0, 1)),
    merged_pull_requests    INTEGER NOT NULL DEFAULT 1 CHECK (merged_pull_requests IN (0, 1)),
    enabled                 INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    last_registered_at      TEXT NOT NULL DEFAULT (datetime('now')),
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(platform, token)
  );

  CREATE INDEX IF NOT EXISTS idx_push_devices_enabled
    ON push_devices(enabled);

  CREATE TABLE IF NOT EXISTS diagnostic_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    ts             INTEGER NOT NULL,
    level          TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
    event          TEXT NOT NULL,
    source         TEXT NOT NULL,
    correlation_id TEXT,
    owner          TEXT,
    repo           TEXT,
    issue_number   INTEGER,
    deployment_id  INTEGER,
    session_name   TEXT,
    ttyd_port      INTEGER,
    ttyd_pid       INTEGER,
    status         TEXT,
    message        TEXT,
    data_json      TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_diagnostic_events_ts
    ON diagnostic_events(ts);
  CREATE INDEX IF NOT EXISTS idx_diagnostic_events_issue
    ON diagnostic_events(owner, repo, issue_number, ts);
  CREATE INDEX IF NOT EXISTS idx_diagnostic_events_deployment
    ON diagnostic_events(deployment_id, ts);
  CREATE INDEX IF NOT EXISTS idx_diagnostic_events_event
    ON diagnostic_events(event, ts);
  CREATE INDEX IF NOT EXISTS idx_diagnostic_events_correlation
    ON diagnostic_events(correlation_id, ts);

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

  CREATE TABLE IF NOT EXISTS pr_reviews (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    repo_id             INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    pr_number           INTEGER NOT NULL,
    deployment_id       INTEGER REFERENCES deployments(id),
    started_head_sha    TEXT NOT NULL,
    completed_head_sha  TEXT,
    review_base_sha     TEXT NOT NULL,
    reviewed_from_sha   TEXT,
    reviewed_to_sha     TEXT NOT NULL,
    head_repo_full_name TEXT NOT NULL,
    head_ref            TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'reserved'
                        CHECK (status IN ('reserved', 'launching', 'in_progress', 'completed', 'failed', 'superseded')),
    triggered_by        TEXT NOT NULL CHECK (triggered_by IN ('webhook', 'comment_command', 'manual')),
    result_json         TEXT,
    started_at          INTEGER NOT NULL,
    completed_at        INTEGER,
    UNIQUE(repo_id, pr_number, reviewed_to_sha)
  );

  CREATE INDEX IF NOT EXISTS idx_pr_reviews_active
    ON pr_reviews(repo_id, pr_number)
    WHERE status IN ('reserved', 'launching', 'in_progress');

  CREATE TABLE IF NOT EXISTS agent_action_budgets (
    deployment_id INTEGER NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
    action_type   TEXT NOT NULL
                  CHECK (action_type IN ('push', 'comment', 'label', 'create_issue', 'create_pr')),
    limit_count   INTEGER NOT NULL DEFAULT 0 CHECK (limit_count >= 0),
    used_count    INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0 AND used_count <= limit_count),
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL,
    PRIMARY KEY (deployment_id, action_type)
  );

  CREATE INDEX IF NOT EXISTS idx_agent_action_budgets_deployment
    ON agent_action_budgets(deployment_id);

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );
`;

// The live deployment target index is intentionally NOT in CREATE_TABLES. On
// upgrade DBs that pre-date R1 idempotency, the deployments table may
// contain duplicate live rows from before the singleflight fix landed;
// SQLite cannot create a unique index over a table that already
// violates it, so a naive `CREATE UNIQUE INDEX IF NOT EXISTS` in
// CREATE_TABLES would throw before the v9 migration's dedupe pass got
// a chance to run (initSchema is called before runMigrations in
// connection.ts). The fix:
//   - Fresh installs: deployments is empty, so initSchema can create
//     the index directly below after setting schema_version.
//   - Upgrade installs: the v9 migration runs the dedupe and the
//     CREATE INDEX in the correct order via runMigrations.
const CREATE_LIVE_DEPLOYMENT_INDEX = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_deployments_live_target
    ON deployments(repo_id, target_type, target_number)
    WHERE ended_at IS NULL;
`;

export function initSchema(db: Database.Database): void {
  db.exec(CREATE_TABLES);

  const row = db.prepare("SELECT version FROM schema_version").get() as
    | { version: number }
    | undefined;

  if (!row) {
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(
      SCHEMA_VERSION,
    );
    // Fresh install — deployments is empty, so the unique index
    // creates cleanly. Upgrade DBs deliberately skip this branch and
    // go through the v9 migration's dedupe-then-create-index path.
    db.exec(CREATE_LIVE_DEPLOYMENT_INDEX);
  }
}

export function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare("SELECT version FROM schema_version").get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0;
}

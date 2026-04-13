import type Database from "better-sqlite3";

const SCHEMA_VERSION = 9;

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS repos (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    owner          TEXT NOT NULL,
    name           TEXT NOT NULL,
    local_path     TEXT,
    branch_pattern TEXT,
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
    issue_number     INTEGER NOT NULL,
    branch_name      TEXT NOT NULL,
    workspace_mode   TEXT NOT NULL,
    workspace_path   TEXT NOT NULL,
    linked_pr_number INTEGER,
    state            TEXT NOT NULL DEFAULT 'active'
                     CHECK (state IN ('pending', 'active')),
    launched_at      TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at         TEXT
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

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );
`;

// `idx_deployments_live` is intentionally NOT in CREATE_TABLES. On
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
  CREATE UNIQUE INDEX IF NOT EXISTS idx_deployments_live
    ON deployments(repo_id, issue_number)
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

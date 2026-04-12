import type Database from "better-sqlite3";

const SCHEMA_VERSION = 6;

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
    repo_id          INTEGER NOT NULL REFERENCES repos(id),
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

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );
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
  }
}

export function getSchemaVersion(db: Database.Database): number {
  const row = db.prepare("SELECT version FROM schema_version").get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0;
}

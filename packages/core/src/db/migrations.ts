import type Database from "better-sqlite3";
import { getSchemaVersion } from "./schema.js";

type Migration = {
  version: number;
  up: (db: Database.Database) => void;
};

const migrations: Migration[] = [
  {
    version: 2,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS claude_aliases (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          command     TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL DEFAULT '',
          is_default  INTEGER NOT NULL DEFAULT 0,
          created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
    },
  },
  {
    version: 3,
    up(db) {
      db.exec(`ALTER TABLE deployments ADD COLUMN ended_at TEXT;`);
    },
  },
  {
    version: 4,
    up(db) {
      // Log how many rows are being destroyed so users/operators have a paper
      // trail when the alias feature's data disappears. The table may not exist
      // on fresh installs, so the count query is itself guarded.
      const row = db
        .prepare(
          "SELECT COUNT(*) as c FROM sqlite_master WHERE type = 'table' AND name = 'claude_aliases'",
        )
        .get() as { c: number };
      if (row.c > 0) {
        const { n } = db
          .prepare("SELECT COUNT(*) as n FROM claude_aliases")
          .get() as { n: number };
        if (n > 0) {
          console.warn(
            `[issuectl] Migration v4: dropping claude_aliases table containing ${n} row(s). The alias feature has been replaced by the claude_extra_args setting.`,
          );
        }
      }
      db.exec(`DROP TABLE IF EXISTS claude_aliases;`);
    },
  },
  {
    version: 5,
    up(db) {
      // Adds two new tables for the Paper reskin: drafts (local-only
      // scratchpad for issues not yet pushed to GitHub) and issue_metadata
      // (per-issue local annotations — currently just priority, since
      // GitHub has no native priority field). Both tables enforce the
      // priority CHECK constraint matching the TypeScript Priority union.
      db.exec(`
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
      `);
    },
  },
  {
    version: 6,
    up(db) {
      // R2: deployments now have an explicit lifecycle state. "pending"
      // covers the narrow window during executeLaunch between writing the
      // DB row and the terminal actually opening — if the terminal launch
      // fails, the launch flow deletes the pending row as a clean rollback.
      // Existing rows migrate to "active" (they pre-date the state column
      // and are already live).
      //
      // SQLite can't ADD COLUMN with a CHECK constraint, so we add the
      // column with a DEFAULT and rely on the application layer to insert
      // only valid values going forward. The CREATE TABLE for fresh
      // installs in schema.ts does include the CHECK constraint.
      db.exec(`ALTER TABLE deployments ADD COLUMN state TEXT NOT NULL DEFAULT 'active';`);
    },
  },
  {
    version: 7,
    up(db) {
      // R1: action_nonces table backs the idempotency sentinel. A client
      // generates a UUID per submission; the server claims the (nonce,
      // action_type) pair via INSERT OR IGNORE before running the action
      // and stores the serialized result on completion. A second call
      // with the same nonce either replays the stored result (completed)
      // or refuses (pending / failed). Cleanup runs opportunistically
      // on writes — rows older than 1 hour are pruned.
      db.exec(`
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
      `);
    },
  },
  {
    version: 8,
    up(db) {
      // Rebuild `deployments` so `repo_id` uses ON DELETE CASCADE — the
      // v1 schema omitted the clause, and SQLite cannot ALTER an FK.
      // Nothing else references `deployments`, so the rebuild needs no
      // deferred-FK gymnastics. The rebuild also folds in the
      // CHECK (state IN ('pending','active')) constraint that the v6
      // ALTER-based migration could not add, so migrated DBs now match
      // fresh installs.
      db.exec(`
        CREATE TABLE deployments_new (
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

        INSERT INTO deployments_new (
          id, repo_id, issue_number, branch_name, workspace_mode,
          workspace_path, linked_pr_number, state, launched_at, ended_at
        )
        SELECT
          id, repo_id, issue_number, branch_name, workspace_mode,
          workspace_path, linked_pr_number, state, launched_at, ended_at
        FROM deployments;

        DROP TABLE deployments;
        ALTER TABLE deployments_new RENAME TO deployments;
      `);
    },
  },
  {
    version: 9,
    up(db) {
      // Enforce at most one live (not-ended) deployment per
      // (repo, issue). DBs that ran under earlier versions may already
      // have duplicates — end the older rows first (most recent id per
      // pair wins) so the index creation cannot fail. The subquery's
      // inner `ended_at IS NULL` filter is load-bearing: a mixed
      // live+ended pair must keep its live row, even if the live row
      // is not the highest id overall.
      //
      // Count duplicates first and log the row count so operators have
      // a paper trail for state that quietly disappears from the UI
      // (matches the v4 claude_aliases precedent).
      const { n } = db
        .prepare(
          `SELECT COUNT(*) as n FROM deployments
           WHERE ended_at IS NULL
             AND id NOT IN (
               SELECT MAX(id) FROM deployments
               WHERE ended_at IS NULL
               GROUP BY repo_id, issue_number
             )`,
        )
        .get() as { n: number };
      if (n > 0) {
        console.warn(
          `[issuectl] Migration v9: ending ${n} duplicate live deployment row(s) so the new unique index can be created. The most recent deployment per (repo, issue) is kept; older rows receive ended_at = now.`,
        );
      }

      db.exec(`
        UPDATE deployments
        SET ended_at = datetime('now')
        WHERE ended_at IS NULL
          AND id NOT IN (
            SELECT MAX(id) FROM deployments
            WHERE ended_at IS NULL
            GROUP BY repo_id, issue_number
          );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_deployments_live
          ON deployments(repo_id, issue_number)
          WHERE ended_at IS NULL;
      `);
    },
  },
  {
    version: 10,
    up(db) {
      // Local cache of the authenticated user's accessible GitHub repos.
      // Populated by the RepoPicker in settings so adding a new repo shows
      // a searchable list without a network round-trip on every open.
      // Refreshed on-demand via the picker's refresh button or when
      // synced_at is older than the app-level staleness threshold (24h).
      db.exec(`
        CREATE TABLE IF NOT EXISTS github_accessible_repos (
          owner      TEXT NOT NULL,
          name       TEXT NOT NULL,
          is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
          pushed_at  TEXT,
          synced_at  INTEGER NOT NULL,
          PRIMARY KEY (owner, name)
        );
      `);
    },
  },
  {
    version: 11,
    up(db) {
      db.exec(`
        ALTER TABLE deployments ADD COLUMN ttyd_port INTEGER;
        ALTER TABLE deployments ADD COLUMN ttyd_pid INTEGER;
      `);
    },
  },
  {
    version: 12,
    up(db) {
      db.exec(`ALTER TABLE deployments ADD COLUMN idle_since TEXT;`);
    },
  },
  {
    version: 13,
    up(db) {
      // Launches can now target either Claude Code or Codex. Existing
      // deployments were all Claude sessions, so the column backfills to
      // "claude"; settings default to preserving the existing behavior.
      db.exec(`
        ALTER TABLE deployments ADD COLUMN agent TEXT NOT NULL DEFAULT 'claude'
          CHECK (agent IN ('claude', 'codex'));
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(
        "launch_agent",
        "claude",
      );
      db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(
        "codex_extra_args",
        "",
      );
    },
  },
  {
    version: 14,
    up(db) {
      db.exec(`
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
      `);
    },
  },
];

export function runMigrations(db: Database.Database): void {
  const currentVersion = getSchemaVersion(db);

  const pending = migrations.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const applyAll = db.transaction(() => {
    for (const migration of pending) {
      migration.up(db);
      db.prepare("UPDATE schema_version SET version = ?").run(
        migration.version,
      );
    }
  });

  applyAll();
}

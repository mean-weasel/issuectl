import type Database from "better-sqlite3";

export function runAgentActionsMigration(db: Database.Database): void {
  db.exec(`
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
  `);
}

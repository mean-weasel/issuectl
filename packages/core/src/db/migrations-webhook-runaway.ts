import type Database from "better-sqlite3";

export function runWebhookRunawayMigration(db: Database.Database): void {
  if (hasTable(db, "deployments")) {
    if (!hasColumn(db, "deployments", "parent_deployment_id")) {
      db.exec("ALTER TABLE deployments ADD COLUMN parent_deployment_id INTEGER REFERENCES deployments(id) ON DELETE SET NULL;");
    }
    if (!hasColumn(db, "deployments", "webhook_depth")) {
      db.exec("ALTER TABLE deployments ADD COLUMN webhook_depth INTEGER NOT NULL DEFAULT 0 CHECK (webhook_depth >= 0);");
    }
  }
  db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
  db.exec("INSERT OR IGNORE INTO settings (key, value) VALUES ('max_webhook_recursion_depth', '1');");
}

function hasTable(db: Database.Database, name: string): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { count: number };
  return row.count > 0;
}

function hasColumn(db: Database.Database, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((item) => item.name === column);
}

import type Database from "better-sqlite3";
import type { ClaudeAlias } from "../types.js";

type AliasRow = {
  id: number;
  command: string;
  description: string;
  is_default: number;
  created_at: string;
};

function toAlias(row: AliasRow): ClaudeAlias {
  return {
    id: row.id,
    command: row.command,
    description: row.description,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
  };
}

export function listAliases(db: Database.Database): ClaudeAlias[] {
  const rows = db
    .prepare("SELECT * FROM claude_aliases ORDER BY command")
    .all() as AliasRow[];
  return rows.map(toAlias);
}

export function getDefaultAlias(db: Database.Database): ClaudeAlias | undefined {
  const row = db
    .prepare("SELECT * FROM claude_aliases WHERE is_default = 1")
    .get() as AliasRow | undefined;
  return row ? toAlias(row) : undefined;
}

export function addAlias(
  db: Database.Database,
  command: string,
  description: string,
): ClaudeAlias {
  const cmd = command.trim();
  if (!cmd) {
    throw new Error("Alias command must not be empty");
  }
  if (!/^[\w./-]+$/.test(cmd)) {
    throw new Error("Alias command must be a simple executable name (letters, numbers, hyphens, underscores, dots, slashes)");
  }
  const info = db
    .prepare("INSERT INTO claude_aliases (command, description) VALUES (?, ?)")
    .run(cmd, description);
  const row = db
    .prepare("SELECT * FROM claude_aliases WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as AliasRow;
  return toAlias(row);
}

export function removeAlias(db: Database.Database, id: number): void {
  const info = db.prepare("DELETE FROM claude_aliases WHERE id = ?").run(id);
  if (info.changes === 0) {
    throw new Error(`Alias with id ${id} not found`);
  }
}

export function setDefaultAlias(db: Database.Database, id: number): void {
  const txn = db.transaction(() => {
    db.prepare("UPDATE claude_aliases SET is_default = 0").run();
    const info = db.prepare("UPDATE claude_aliases SET is_default = 1 WHERE id = ?").run(id);
    if (info.changes === 0) {
      throw new Error(`Alias with id ${id} not found`);
    }
  });
  txn();
}

export function clearDefaultAlias(db: Database.Database): void {
  db.prepare("UPDATE claude_aliases SET is_default = 0").run();
}

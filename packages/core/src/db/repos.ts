import type Database from "better-sqlite3";
import type { Repo } from "../types.js";

type RepoRow = {
  id: number;
  owner: string;
  name: string;
  local_path: string | null;
  branch_pattern: string | null;
  created_at: string;
};

function rowToRepo(row: RepoRow): Repo {
  return {
    id: row.id,
    owner: row.owner,
    name: row.name,
    localPath: row.local_path,
    branchPattern: row.branch_pattern,
    createdAt: row.created_at,
  };
}

export function addRepo(
  db: Database.Database,
  repo: {
    owner: string;
    name: string;
    localPath?: string;
    branchPattern?: string;
  },
): Repo {
  const result = db
    .prepare(
      "INSERT INTO repos (owner, name, local_path, branch_pattern) VALUES (?, ?, ?, ?)",
    )
    .run(
      repo.owner,
      repo.name,
      repo.localPath ?? null,
      repo.branchPattern ?? null,
    );

  const inserted = getRepoById(db, Number(result.lastInsertRowid));
  if (!inserted) throw new Error("Failed to read back repo after insert");
  return inserted;
}

export function removeRepo(db: Database.Database, id: number): void {
  const result = db.prepare("DELETE FROM repos WHERE id = ?").run(id);
  if (result.changes === 0) {
    throw new Error(`No repo found with id ${id} to remove`);
  }
}

export function getRepo(
  db: Database.Database,
  owner: string,
  name: string,
): Repo | undefined {
  const row = db
    .prepare("SELECT * FROM repos WHERE owner = ? AND name = ?")
    .get(owner, name) as RepoRow | undefined;
  return row ? rowToRepo(row) : undefined;
}

export function getRepoById(
  db: Database.Database,
  id: number,
): Repo | undefined {
  const row = db.prepare("SELECT * FROM repos WHERE id = ?").get(id) as
    | RepoRow
    | undefined;
  return row ? rowToRepo(row) : undefined;
}

export function listRepos(db: Database.Database): Repo[] {
  const rows = db
    .prepare("SELECT * FROM repos ORDER BY created_at DESC")
    .all() as RepoRow[];
  return rows.map(rowToRepo);
}

export function updateRepo(
  db: Database.Database,
  id: number,
  updates: Partial<Pick<Repo, "localPath" | "branchPattern">>,
): Repo {
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.localPath !== undefined) {
    fields.push("local_path = ?");
    values.push(updates.localPath);
  }
  if (updates.branchPattern !== undefined) {
    fields.push("branch_pattern = ?");
    values.push(updates.branchPattern);
  }

  if (fields.length > 0) {
    values.push(id);
    db.prepare(`UPDATE repos SET ${fields.join(", ")} WHERE id = ?`).run(
      ...values,
    );
  }

  const updated = getRepoById(db, id);
  if (!updated) throw new Error(`Repo with id ${id} not found`);
  return updated;
}

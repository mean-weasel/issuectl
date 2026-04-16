import type Database from "better-sqlite3";
import type { GitHubAccessibleRepo } from "../github/types.js";

type Row = {
  owner: string;
  name: string;
  is_private: 0 | 1;
  pushed_at: string | null;
  synced_at: number;
};

export function listCachedAccessibleRepos(
  db: Database.Database,
): { repos: GitHubAccessibleRepo[]; syncedAt: number | null } {
  const rows = db
    .prepare(
      "SELECT owner, name, is_private, pushed_at, synced_at FROM github_accessible_repos ORDER BY pushed_at DESC NULLS LAST, owner ASC, name ASC",
    )
    .all() as Row[];

  if (rows.length === 0) return { repos: [], syncedAt: null };

  return {
    repos: rows.map((r) => ({
      owner: r.owner,
      name: r.name,
      private: r.is_private === 1,
      pushedAt: r.pushed_at,
    })),
    syncedAt: rows[0].synced_at,
  };
}

export function getAccessibleReposSyncedAt(
  db: Database.Database,
): number | null {
  const row = db
    .prepare("SELECT MAX(synced_at) as synced_at FROM github_accessible_repos")
    .get() as { synced_at: number | null } | undefined;
  return row?.synced_at ?? null;
}

export function replaceAccessibleRepos(
  db: Database.Database,
  repos: GitHubAccessibleRepo[],
): number {
  const now = Math.floor(Date.now() / 1000);
  const replaceAll = db.transaction((items: GitHubAccessibleRepo[]) => {
    db.prepare("DELETE FROM github_accessible_repos").run();
    const insert = db.prepare(
      "INSERT INTO github_accessible_repos (owner, name, is_private, pushed_at, synced_at) VALUES (?, ?, ?, ?, ?)",
    );
    for (const r of items) {
      insert.run(r.owner, r.name, r.private ? 1 : 0, r.pushedAt, now);
    }
  });
  replaceAll(repos);
  return now;
}

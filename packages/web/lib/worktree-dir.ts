import { getDb, getSetting, expandHome, DEFAULT_WORKTREE_DIR } from "@issuectl/core";

export function getWorktreeDir(): string {
  const db = getDb();
  const configured = getSetting(db, "worktree_dir");
  return expandHome(configured ?? DEFAULT_WORKTREE_DIR);
}

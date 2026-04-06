export type Repo = {
  id: number;
  owner: string;
  name: string;
  localPath: string | null;
  branchPattern: string | null;
  createdAt: string;
};

export type SettingKey =
  | "branch_pattern"
  | "terminal_app"
  | "terminal_mode"
  | "cache_ttl"
  | "worktree_dir";

export type Setting = {
  key: SettingKey;
  value: string;
};

export type Deployment = {
  id: number;
  repoId: number;
  issueNumber: number;
  branchName: string;
  workspaceMode: "existing" | "worktree" | "clone";
  workspacePath: string;
  linkedPrNumber: number | null;
  launchedAt: string;
};

export type CacheEntry<T = unknown> = {
  data: T;
  fetchedAt: Date;
};

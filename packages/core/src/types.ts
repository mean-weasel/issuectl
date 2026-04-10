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
  | "terminal_window_title"
  | "terminal_tab_title_pattern"
  | "cache_ttl"
  | "worktree_dir"
  | "claude_extra_args";

export type Setting = {
  key: SettingKey;
  value: string;
};

import type { WorkspaceMode } from "./launch/workspace.js";

export type Deployment = {
  id: number;
  repoId: number;
  issueNumber: number;
  branchName: string;
  workspaceMode: WorkspaceMode;
  workspacePath: string;
  linkedPrNumber: number | null;
  launchedAt: string;
  endedAt: string | null;
};

export type CacheEntry<T = unknown> = {
  data: T;
  fetchedAt: Date;
};

export type Priority = "low" | "normal" | "high";

export type Draft = {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  createdAt: number; // unix seconds
  updatedAt: number; // unix seconds
};

export type DraftInput = {
  title: string;
  body?: string;
  priority?: Priority;
};

export type IssuePriority = {
  repoId: number;
  issueNumber: number;
  priority: Priority;
  updatedAt: number; // unix seconds
};

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
import type { GitHubIssue } from "./github/types.js";

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

export type Section = "unassigned" | "in_focus" | "in_flight" | "shipped";

// A UnifiedListItem is either a local draft (unassigned) or a
// GitHub-backed issue enriched with its local priority and its
// lifecycle state for the current section.
export type UnifiedListItem =
  | {
      kind: "draft";
      draft: Draft;
    }
  | {
      kind: "issue";
      repo: Repo;
      issue: GitHubIssue;
      priority: Priority;
      section: Exclude<Section, "unassigned">;
    };

export type UnifiedList = {
  unassigned: UnifiedListItem[];
  in_focus: UnifiedListItem[];
  in_flight: UnifiedListItem[];
  shipped: UnifiedListItem[];
};

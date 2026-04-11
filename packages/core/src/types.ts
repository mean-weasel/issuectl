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

// Display labels for each section. Keyed on the underscore form used in
// the type so a new section can't be added without giving it a label.
export const SECTION_LABEL: Record<Section, string> = {
  unassigned: "unassigned",
  in_focus: "in focus",
  in_flight: "in flight",
  shipped: "shipped",
};

// A UnifiedListItem is a discriminated union with two variants: a local
// Draft (the caller will place it in the unassigned section) or a
// GitHub-backed issue already assigned to one of the three issue sections.
// The section field is narrowed to exclude "unassigned" so the type
// prevents constructing an issue item that claims to be unassigned.
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

// Narrow helpers for places that want a specific variant.
export type DraftListItem = Extract<UnifiedListItem, { kind: "draft" }>;
export type IssueListItem = Extract<UnifiedListItem, { kind: "issue" }>;

// UnifiedList is parametrized by variant so each section can only hold
// the kind that belongs there: unassigned → drafts only, the three issue
// sections → issue items only. This prevents groupIntoSections (or any
// future caller) from silently pushing an issue into unassigned.
export type UnifiedList = {
  unassigned: DraftListItem[];
  in_focus: IssueListItem[];
  in_flight: IssueListItem[];
  shipped: IssueListItem[];
};

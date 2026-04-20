export type GitHubUser = {
  login: string;
  avatarUrl: string;
};

export type GitHubLabel = {
  name: string;
  color: string;
  description: string | null;
};

export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: GitHubLabel[];
  user: GitHubUser | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  htmlUrl: string;
};

export type GitHubComment = {
  id: number;
  body: string;
  user: GitHubUser | null;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
};

export type GitHubPull = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged: boolean;
  user: GitHubUser | null;
  headRef: string;
  baseRef: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  htmlUrl: string;
};

// Raw API user shape for mapper functions
export type RawGitHubUser = { login: string; avatar_url: string } | null;

export function mapUser(raw: RawGitHubUser): GitHubUser | null {
  return raw ? { login: raw.login, avatarUrl: raw.avatar_url } : null;
}

export type GitHubCheck = {
  name: string;
  status: "queued" | "in_progress" | "completed";
  conclusion: "success" | "failure" | "neutral" | "cancelled" | "timed_out" | "action_required" | "skipped" | "stale" | null;
  startedAt: string | null;
  completedAt: string | null;
  htmlUrl: string | null;
};

export type GitHubPullFile = {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
};

export type GitHubAccessibleRepo = {
  owner: string;
  name: string;
  private: boolean;
  pushedAt: string | null;
};

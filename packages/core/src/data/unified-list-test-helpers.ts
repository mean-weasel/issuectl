import type { Draft, Repo, Deployment } from "../types.js";
import type { GitHubIssue } from "../github/types.js";

export const repo: Repo = {
  id: 1,
  owner: "neonwatty",
  name: "api",
  localPath: null,
  branchPattern: null,
  autoLaunchIssues: false,
  autoReviewPrs: false,
  issueAgent: "claude",
  reviewAgent: "claude",
  webhookId: null,
  reviewPreamble: null,
  webhookPayloadMode: "metadata",
  createdAt: "2026-01-01",
};

export function makeIssue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 1,
    title: "Test issue",
    body: "",
    state: "open",
    labels: [],
    assignees: [],
    user: null,
    commentCount: 0,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    closedAt: null,
    htmlUrl: "https://github.com/neonwatty/api/issues/1",
    ...overrides,
  };
}

export function makeDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    id: "draft-" + Math.random().toString(36).slice(2, 8),
    title: "Draft",
    body: "",
    priority: "normal",
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

export function makeDeployment(issueNumber: number, ended = false): Deployment {
  return {
    id: issueNumber * 10,
    repoId: repo.id,
    issueNumber,
    agent: "claude",
    branchName: `issue-${issueNumber}`,
    workspaceMode: "worktree",
    workspacePath: `/tmp/${issueNumber}`,
    linkedPrNumber: null,
    state: "active",
    terminalBackend: "ttyd",
    launchedAt: "2026-04-01T00:00:00Z",
    endedAt: ended ? "2026-04-02T00:00:00Z" : null,
    ttydPort: null,
    ttydPid: null,
    idleSince: null,
  };
}

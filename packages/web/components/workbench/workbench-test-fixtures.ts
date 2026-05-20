import type { WorkbenchPayload, WorkbenchRepo } from "./workbench-types";

export function payloadFixture(): WorkbenchPayload {
  return {
    repos: [
      repo(1, "issuectl", 3),
      repo(2, "bugdrop", 1),
      repo(3, "api", 0),
      repo(4, "web", 0),
    ],
    deployments: [],
    previews: {},
    settings: {},
    health: { ok: true, version: "0.0.0", timestamp: null, error: null },
    user: { login: "jeremy", error: null },
    generatedAt: "2026-05-16T16:00:00.000Z",
  };
}

export function repo(id: number, name: string, deploymentCount: number): WorkbenchRepo {
  if (id === 1) {
    return {
      id,
      owner: "mean-weasel",
      name,
      localPath: `/workspace/${name}`,
      branchPattern: null,
      badgeCount: deploymentCount,
      deployedCount: deploymentCount,
      launchAgent: "codex",
      issueError: null,
      issuesFromCache: false,
      issuesCachedAt: null,
      priorities: [],
      deployments: [
        deployment(101, id, name, 447, 7701, "2026-05-16T15:00:00.000Z"),
        deployment(102, id, name, 498, 7702, "2026-05-16T16:00:00.000Z"),
        deployment(103, id, name, 486, 7703, "2026-05-16T17:00:00.000Z"),
      ],
      previews: {
        "7701": preview("active", "active preview"),
        "7702": preview("idle", "idle preview"),
        "7703": preview("error", "error preview"),
        "7704": preview("unavailable", "unavailable preview"),
      },
      issues: [
        issue(447, "Mac sidebar"),
        issue(498, "Terminal resize"),
        issue(486, "Preview error state"),
        { ...issue(512, "Desktop instance manager workbench"), hasActiveDeployment: false },
      ],
    };
  }

  return {
    id,
    owner: "mean-weasel",
    name,
    localPath: `/workspace/${name}`,
    branchPattern: null,
    badgeCount: deploymentCount,
    deployedCount: deploymentCount,
    launchAgent: null,
    issueError: null,
    issuesFromCache: false,
    issuesCachedAt: null,
    priorities: [],
    deployments: Array.from({ length: deploymentCount }, (_, index) => ({
      id: id * 100 + index,
      repoId: id,
      issueNumber: 400 + index,
      agent: "codex",
      branchName: `issue-${400 + index}`,
      workspaceMode: "worktree",
      workspacePath: `/workspace/${name}`,
      linkedPrNumber: null,
      state: "active",
      launchedAt: "2026-05-16T16:00:00.000Z",
      endedAt: null,
      ttydPort: 7700 + index,
      ttydPid: 1234 + index,
      idleSince: null,
      owner: "mean-weasel",
      repoName: name,
    })),
    previews: {},
    issues: [],
  };
}

function deployment(
  id: number,
  repoId: number,
  repoName: string,
  issueNumber: number,
  ttydPort: number,
  launchedAt: string,
) {
  return {
    id,
    repoId,
    issueNumber,
    agent: "codex" as const,
    branchName: `issue-${issueNumber}`,
    workspaceMode: "worktree" as const,
    workspacePath: `/workspace/${repoName}`,
    linkedPrNumber: null,
    state: "active" as const,
    launchedAt,
    endedAt: null,
    ttydPort,
    ttydPid: 1234,
    idleSince: null,
    owner: "mean-weasel",
    repoName,
  };
}

function preview(status: "active" | "idle" | "error" | "unavailable", line: string) {
  return {
    lines: [line],
    lastUpdatedMs: 1_779_000_000_000,
    lastChangedMs: status === "idle" ? null : 1_779_000_000_000,
    status,
  };
}

export function issue(number: number, title: string) {
  return {
    number,
    title,
    state: "open" as const,
    labels: [],
    updatedAt: "2026-05-16T16:00:00.000Z",
    priority: "normal" as const,
    hasActiveDeployment: true,
    htmlUrl: `https://github.com/mean-weasel/issuectl/issues/${number}`,
    authorLogin: "jeremy",
  };
}

import { describe, expect, it } from "vitest";
import type { WorkbenchPayload, WorkbenchRepo } from "./workbench-types";
import {
  DEFAULT_WORKBENCH_COLUMN_WIDTHS,
  WORKBENCH_COLUMN_WIDTH_LIMITS,
  clampWorkbenchColumnWidths,
  compactRepoInitials,
  createWorkbenchState,
  filterIssueQueue,
  issueQueueCounts,
  repoRailBadgeCount,
  selectedRepo,
  sidePaneWidthsApply,
  sortDeploymentSessions,
  workbenchReducer,
} from "./workbench-state";

describe("workbench state", () => {
  it("selects the first repo by default", () => {
    const payload = payloadFixture();
    const state = createWorkbenchState(payload);

    expect(state.selectedRepoId).toBe(1);
    expect(selectedRepo(payload, state)?.name).toBe("issuectl");
  });

  it("selecting a repo clears selected issue and session state", () => {
    const payload = payloadFixture();
    const initial = {
      ...createWorkbenchState(payload),
      selectedIssueNumber: 447,
      selectedDeploymentId: 101,
    };

    const next = workbenchReducer(initial, { type: "selectRepo", repoId: 2 });

    expect(next.selectedRepoId).toBe(2);
    expect(next.selectedIssueNumber).toBeNull();
    expect(next.selectedDeploymentId).toBeNull();
    expect(next.mode).toBe("workbench");
  });

  it("uses live deployment counts for rail badges", () => {
    const payload = payloadFixture();

    expect(payload.repos.map(repoRailBadgeCount)).toEqual([3, 1, 0, 0]);
    expect(payload.repos.map((repo) => compactRepoInitials(repo.name))).toEqual([
      "IC",
      "BD",
      "API",
      "WEB",
    ]);
  });

  it("keeps the selected repo when moving through workbench submodes", () => {
    const payload = payloadFixture();
    const selectedBugdrop = workbenchReducer(createWorkbenchState(payload), {
      type: "selectRepo",
      repoId: 2,
    });

    const settings = workbenchReducer(selectedBugdrop, { type: "selectMode", mode: "settings" });
    const board = workbenchReducer(settings, { type: "selectMode", mode: "board" });
    const workbench = workbenchReducer(board, { type: "selectMode", mode: "workbench" });

    expect(workbench.selectedRepoId).toBe(2);
    expect(selectedRepo(payload, workbench)?.name).toBe("bugdrop");
  });

  it("replaces repo-specific selection without changing the current mode", () => {
    const selectedBugdropIssue = workbenchReducer(
      workbenchReducer(
        workbenchReducer(createWorkbenchState(payloadFixture()), { type: "selectRepo", repoId: 2 }),
        { type: "selectIssue", issueNumber: 440 },
      ),
      { type: "selectMode", mode: "settings" },
    );

    const next = workbenchReducer(selectedBugdropIssue, { type: "replaceSelectedRepo", repoId: 1 });

    expect(next.selectedRepoId).toBe(1);
    expect(next.selectedIssueNumber).toBeNull();
    expect(next.selectedDeploymentId).toBeNull();
    expect(next.mode).toBe("settings");
  });

  it("sorts issue sessions by running first, recent, and kind deterministically", () => {
    const payload = payloadFixture();
    const repo = payload.repos[0];

    expect(sortDeploymentSessions(repo.deployments, repo.previews, "running first").map((item) => item.id))
      .toEqual([101, 103, 102]);
    expect(sortDeploymentSessions(repo.deployments, repo.previews, "recent").map((item) => item.id))
      .toEqual([103, 102, 101]);
    expect(sortDeploymentSessions(repo.deployments, repo.previews, "kind").map((item) => item.id))
      .toEqual([101, 103, 102]);
  });

  it("groups repo issues into open work, running, and closed filters", () => {
    const repo = payloadFixture().repos[0];

    expect(issueQueueCounts(repo)).toEqual({ open: 4, running: 3, closed: 0 });
    expect(filterIssueQueue(repo.issues, "open").map((item) => item.number))
      .toEqual([447, 498, 486, 512]);
    expect(filterIssueQueue(repo.issues, "running").map((item) => item.number))
      .toEqual([447, 498, 486]);
    expect(filterIssueQueue(repo.issues, "closed")).toEqual([]);
  });

  it("clamps column widths to objective UI limits", () => {
    expect(clampWorkbenchColumnWidths({
      instances: WORKBENCH_COLUMN_WIDTH_LIMITS.instances.min - 100,
      issues: WORKBENCH_COLUMN_WIDTH_LIMITS.issues.min - 100,
    })).toEqual({
      instances: WORKBENCH_COLUMN_WIDTH_LIMITS.instances.min,
      issues: WORKBENCH_COLUMN_WIDTH_LIMITS.issues.min,
    });
    expect(clampWorkbenchColumnWidths({
      instances: WORKBENCH_COLUMN_WIDTH_LIMITS.instances.max + 100,
      issues: WORKBENCH_COLUMN_WIDTH_LIMITS.issues.max + 100,
    })).toEqual({
      instances: WORKBENCH_COLUMN_WIDTH_LIMITS.instances.max,
      issues: WORKBENCH_COLUMN_WIDTH_LIMITS.issues.max,
    });
  });

  it("resets column widths to defaults", () => {
    const resized = workbenchReducer(createWorkbenchState(payloadFixture()), {
      type: "setColumnWidths",
      widths: { instances: 220, issues: 420 },
    });

    const next = workbenchReducer(resized, { type: "resetColumnWidths" });

    expect(next.columnWidths).toEqual(DEFAULT_WORKBENCH_COLUMN_WIDTHS);
  });

  it("keeps section collapse state during repo changes", () => {
    const collapsed = workbenchReducer(createWorkbenchState(payloadFixture()), {
      type: "toggleSection",
      section: "issueSessions",
    });

    const next = workbenchReducer(collapsed, { type: "selectRepo", repoId: 2 });

    expect(next.collapsedSections.issueSessions).toBe(true);
    expect(next.selectedRepoId).toBe(2);
  });

  it("ignores side widths for collapsed global modes", () => {
    expect(sidePaneWidthsApply("workbench")).toBe(true);
    expect(sidePaneWidthsApply("pullRequests")).toBe(true);
    expect(sidePaneWidthsApply("quickCreate")).toBe(true);
    expect(sidePaneWidthsApply("globalIssues")).toBe(false);
    expect(sidePaneWidthsApply("board")).toBe(false);
    expect(sidePaneWidthsApply("settings")).toBe(false);
  });
});

function payloadFixture(): WorkbenchPayload {
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

function repo(id: number, name: string, deploymentCount: number): WorkbenchRepo {
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

function issue(number: number, title: string) {
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

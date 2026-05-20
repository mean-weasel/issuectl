import { describe, expect, it } from "vitest";
import { issue, payloadFixture, repo } from "./workbench-test-fixtures";
import {
  compactRepoInitials,
  filterIssueQueue,
  issueQueueCounts,
  repoRailBadgeCount,
  selectedRepo,
  sortDeploymentSessions,
} from "./workbench-selectors";
import {
  DEFAULT_WORKBENCH_COLUMN_WIDTHS,
  WORKBENCH_COLUMN_WIDTH_LIMITS,
  clampWorkbenchColumnWidths,
  createWorkbenchState,
  sidePaneWidthsApply,
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

  it("clears stale issue selection when refreshed payload removes the issue", () => {
    const payload = payloadFixture();
    const selectedIssue = workbenchReducer(createWorkbenchState(payload), {
      type: "selectIssue",
      issueNumber: 512,
    });
    const refreshedPayload = {
      ...payload,
      repos: payload.repos.map((repo) =>
        repo.id === 1
          ? { ...repo, issues: repo.issues.filter((issue) => issue.number !== 512) }
          : repo,
      ),
    };

    const next = workbenchReducer(selectedIssue, { type: "payloadLoaded", payload: refreshedPayload });

    expect(next.selectedRepoId).toBe(1);
    expect(next.selectedIssueNumber).toBeNull();
    expect(next.selectedDeploymentId).toBeNull();
  });

  it("clears stale issue selection when refreshed payload replaces the selected repo", () => {
    const payload = payloadFixture();
    const selectedIssue = workbenchReducer(createWorkbenchState(payload), {
      type: "selectIssue",
      issueNumber: 512,
    });
    const refreshedPayload = {
      ...payload,
      repos: [
        {
          ...repo(5, "replacement", 0),
          issues: [{ ...issue(512, "Replacement repo issue"), hasActiveDeployment: false }],
        },
        ...payload.repos.filter((item) => item.id !== 1),
      ],
    };

    const next = workbenchReducer(selectedIssue, { type: "payloadLoaded", payload: refreshedPayload });

    expect(next.selectedRepoId).toBe(5);
    expect(next.selectedIssueNumber).toBeNull();
    expect(next.selectedDeploymentId).toBeNull();
  });

  it("clears stale deployment selection when refreshed payload removes the deployment", () => {
    const payload = payloadFixture();
    const selectedDeployment = workbenchReducer(createWorkbenchState(payload), {
      type: "selectDeployment",
      deploymentId: 101,
      repoId: 1,
    });
    const refreshedPayload = {
      ...payload,
      repos: payload.repos.map((repo) =>
        repo.id === 1
          ? { ...repo, deployments: repo.deployments.filter((deployment) => deployment.id !== 101) }
          : repo,
      ),
    };

    const next = workbenchReducer(selectedDeployment, { type: "payloadLoaded", payload: refreshedPayload });

    expect(next.selectedRepoId).toBe(1);
    expect(next.selectedIssueNumber).toBeNull();
    expect(next.selectedDeploymentId).toBeNull();
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

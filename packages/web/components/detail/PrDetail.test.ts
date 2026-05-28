import { createElement } from "react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type {
  Deployment,
  GitHubPull,
  GitHubCheck,
  GitHubPullFile,
  GitHubPullReview,
} from "@issuectl/core";
import { PrDetail } from "./PrDetail";

vi.mock("@/components/ui/KeyboardHelpOverlay", () => ({
  KeyboardHelpOverlay: () => null,
}));

vi.mock("./DetailKeyboardNav", () => ({
  DetailKeyboardNav: () => null,
}));

vi.mock("./DetailTopBar", () => ({
  DetailTopBar: (props: { crumb?: unknown }) =>
    createElement("mock-detail-top-bar", null, props.crumb as ReactNode),
}));

vi.mock("@/components/issue/LabelManager", () => ({
  LabelManager: () => createElement("mock-label-manager"),
}));

vi.mock("@/components/terminal/OpenTerminalButton", () => ({
  OpenTerminalButton: () => createElement("mock-open-terminal", null, "Open Terminal"),
}));

vi.mock("@/lib/actions/completed-terminal", () => ({
  getCompletedSessionTranscript: vi.fn(),
}));

vi.mock("./CIChecks", () => ({
  CIChecks: () => createElement("mock-ci-checks"),
}));

vi.mock("./ReviewPanel", () => ({
  ReviewPanel: () => createElement("mock-review-panel"),
}));

vi.mock("./FilesChanged", () => ({
  FilesChanged: () => createElement("mock-files-changed"),
}));

vi.mock("./MergeButton", () => ({
  MergeButton: () => createElement("mock-merge-button"),
}));

describe("PrDetail", () => {
  it("renders completed webhook review session evidence when no PR session is active", () => {
    const html = renderToStaticMarkup(
      createElement(PrDetail, {
        owner: "mean-weasel",
        repoName: "issuectl",
        pull: pull({ number: 48, title: "QA review PR" }),
        checks: [] satisfies GitHubCheck[],
        files: [] satisfies GitHubPullFile[],
        reviews: [] satisfies GitHubPullReview[],
        linkedIssue: null,
        availableLabels: [],
        deployments: [
          deployment({
            id: 163,
            targetType: "pr",
            targetNumber: 48,
            issueNumber: null,
            agent: "claude",
            branchName: "qa-webhook-review-20260528T193645Z",
            workspacePath: "/Users/neonwatty/.issuectl/worktrees/issuectl-test-repo-2-pr-48",
            endedAt: "2026-05-28T19:44:12.000Z",
            completionResultJson: JSON.stringify({
              status: "no_changes",
              summary: "QA verified PR review runtime environment.",
            }),
          }),
        ],
        webhookHealth: null,
      }),
    );

    expect(html).toContain("Claude Code reviewed this PR");
    expect(html).toContain("Completed session #163");
    expect(html).toContain("No Changes");
    expect(html).toContain("QA verified PR review runtime environment.");
    expect(html).toContain("qa-webhook-review-20260528T193645Z");
    expect(html).toContain("View completed terminal");
    expect(html).toContain("Session history");
    expect(html).toContain("/sessions?tab=sessions&amp;repo=mean-weasel%2Fissuectl&amp;state=ended&amp;q=PR+%2348");
    expect(html).not.toContain("active review session");
  });

  it("keeps active PR sessions on the live terminal path", () => {
    const html = renderToStaticMarkup(
      createElement(PrDetail, {
        owner: "mean-weasel",
        repoName: "issuectl",
        pull: pull({ number: 48 }),
        checks: [] satisfies GitHubCheck[],
        files: [] satisfies GitHubPullFile[],
        reviews: [] satisfies GitHubPullReview[],
        linkedIssue: null,
        availableLabels: [],
        deployments: [
          deployment({ id: 163, targetType: "pr", targetNumber: 48, issueNumber: null }),
          deployment({ id: 162, targetType: "pr", targetNumber: 48, issueNumber: null, endedAt: null, ttydPort: 7715 }),
        ],
        webhookHealth: null,
      }),
    );

    expect(html).toContain("active review session");
    expect(html).toContain("#162");
    expect(html).toContain("Open Terminal");
    expect(html).not.toContain("Completed session #163");
    expect(html).not.toContain("reviewed this PR");
  });
});

function pull(overrides: Partial<GitHubPull> = {}): GitHubPull {
  return {
    number: 48,
    title: "Review runtime",
    body: "Review me",
    state: "open",
    labels: [],
    draft: false,
    merged: false,
    user: null,
    headRef: "feature",
    baseRef: "main",
    additions: 2,
    deletions: 1,
    changedFiles: 1,
    createdAt: "2026-05-28T19:00:00.000Z",
    updatedAt: "2026-05-28T19:10:00.000Z",
    mergedAt: null,
    closedAt: null,
    htmlUrl: "https://github.com/mean-weasel/issuectl/pull/48",
    ...overrides,
  };
}

function deployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 1,
    repoId: 1,
    issueNumber: 48,
    targetType: "pr",
    targetNumber: 48,
    agent: "claude",
    branchName: "pr-48",
    workspaceMode: "worktree",
    workspacePath: "/tmp/pr-48",
    linkedPrNumber: null,
    state: "active",
    terminalBackend: "pty_bridge",
    triggeredBy: "webhook",
    parentDeploymentId: null,
    webhookDepth: 0,
    launchedAt: "2026-05-28T19:00:00.000Z",
    endedAt: "2026-05-28T19:10:00.000Z",
    terminalReason: "completed",
    completionToken: null,
    completionResultJson: null,
    notificationSentAt: null,
    ttydPort: null,
    ttydPid: null,
    idleSince: null,
    ...overrides,
  };
}

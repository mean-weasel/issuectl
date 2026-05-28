import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Deployment } from "@issuectl/core";
import { LaunchCard } from "./LaunchCard";

vi.mock("@/components/launch/LaunchActiveBanner", () => ({
  LaunchActiveBanner: ({ deploymentId }: { deploymentId: number }) =>
    createElement("div", null, `active banner ${deploymentId} Open Terminal`),
}));

vi.mock("@/lib/actions/completed-terminal", () => ({
  getCompletedSessionTranscript: vi.fn(),
}));

describe("LaunchCard", () => {
  it("keeps live deployments on the active terminal path", () => {
    const html = renderToStaticMarkup(
      createElement(LaunchCard, {
        owner: "mean-weasel",
        repo: "issuectl",
        issueNumber: 26,
        issueTitle: "QA issue",
        deployments: [
          deployment({ id: 12, endedAt: "2026-05-28T11:10:05.000Z" }),
          deployment({ id: 33, endedAt: null, ttydPort: 7777 }),
        ],
      }),
    );

    expect(html).toContain("active banner 33 Open Terminal");
    expect(html).not.toContain("Completed session");
    expect(html).not.toContain("worked this issue");
  });

  it("renders completed session evidence when no live deployment exists", () => {
    const html = renderToStaticMarkup(
      createElement(LaunchCard, {
        owner: "mean-weasel",
        repo: "issuectl",
        issueNumber: 26,
        issueTitle: "QA issue",
        deployments: [
          deployment({
            id: 12,
            agent: "codex",
            branchName: "issue-26-qa",
            workspacePath: "/Users/neonwatty/.issuectl/worktrees/issuectl-test-repo-2-issue-26",
            endedAt: "2026-05-28T11:10:05.000Z",
            terminalReason: "completed",
            completionResultJson: JSON.stringify({
              status: "no_changes",
              summary: "Verified context and clean worktree.",
            }),
          }),
        ],
      }),
    );

    expect(html).toContain("Codex worked this issue");
    expect(html).toContain("Completed session #12");
    expect(html).toContain("No Changes");
    expect(html).toContain("Verified context and clean worktree.");
    expect(html).toContain("issue-26-qa");
    expect(html).toContain("View completed terminal");
    expect(html).toContain("Session history");
    expect(html).toContain("/sessions?tab=sessions&amp;repo=mean-weasel%2Fissuectl&amp;state=ended&amp;q=Issue+%2326");
    expect(html).not.toContain("Open Terminal");
  });

  it("renders nothing when an issue has no deployment history", () => {
    const html = renderToStaticMarkup(
      createElement(LaunchCard, {
        owner: "mean-weasel",
        repo: "issuectl",
        issueNumber: 26,
        issueTitle: "QA issue",
        deployments: [],
      }),
    );

    expect(html).toBe("");
  });
});

function deployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 1,
    repoId: 1,
    issueNumber: 26,
    targetType: "issue",
    targetNumber: 26,
    agent: "codex",
    branchName: "issue-26",
    workspaceMode: "worktree",
    workspacePath: "/tmp/issue-26",
    linkedPrNumber: null,
    state: "active",
    terminalBackend: "pty_bridge",
    triggeredBy: "webhook",
    parentDeploymentId: null,
    webhookDepth: 0,
    launchedAt: "2026-05-28T11:00:00.000Z",
    endedAt: "2026-05-28T11:10:00.000Z",
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

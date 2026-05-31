import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Deployment, GitHubIssue } from "@issuectl/core";
import { IssueDetail } from "./IssueDetail";
import { CompletedSessionCard } from "./CompletedSessionCard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("@/hooks/useOfflineAware", () => ({
  useOfflineAware: () => ({ isOffline: false }),
}));

vi.mock("@/hooks/useStaleTab", () => ({
  useStaleTab: () => undefined,
}));

vi.mock("@/components/launch/LaunchModal", () => ({
  LaunchModal: () => createElement("mock-launch-modal"),
}));

vi.mock("@/components/ui/CloseIssueModal", () => ({
  CloseIssueModal: () => createElement("mock-close-issue-modal"),
}));

vi.mock("@/components/issue/LabelManager", () => ({
  LabelManager: () => createElement("mock-label-manager"),
}));

vi.mock("./EditableTitle", () => ({
  EditableTitle: ({ initialTitle }: { initialTitle: string }) =>
    createElement("h1", null, initialTitle),
}));

vi.mock("./EditableBody", () => ({
  EditableBody: ({ initialBody }: { initialBody: string | null }) =>
    createElement("article", null, initialBody),
}));

vi.mock("./PriorityPicker", () => ({
  PriorityPicker: () => createElement("mock-priority-picker"),
}));

vi.mock("./DetailKeyboardNav", () => ({
  DetailKeyboardNav: () => null,
}));

vi.mock("@/components/ui/KeyboardHelpOverlay", () => ({
  KeyboardHelpOverlay: () => null,
}));

vi.mock("@/lib/actions/completed-terminal", () => ({
  getCompletedSessionTranscript: vi.fn(),
}));

vi.mock("@/lib/actions/issues", () => ({
  closeIssue: vi.fn(),
}));

vi.mock("@/lib/actions/issues-reassign", () => ({
  reassignIssueAction: vi.fn(),
}));

vi.mock("@/lib/actions/launch", () => ({
  endSession: vi.fn(),
}));

vi.mock("@/lib/actions/comments", () => ({
  getComments: vi.fn(),
}));

vi.mock("@/lib/actions/drafts", () => ({
  listReposAction: vi.fn(),
}));

vi.mock("@/lib/tryOrQueue", () => ({
  tryOrQueue: vi.fn(),
}));

describe("IssueDetail", () => {
  it("keeps launch actions visible while showing completed session evidence", () => {
    const endedDeployment = deployment({
      id: 530,
      endedAt: "2026-05-28T11:10:05.000Z",
      completionResultJson: JSON.stringify({
        status: "no_changes",
        summary: "Verified webhook launch and clean completion.",
      }),
    });

    const html = renderToStaticMarkup(
      createElement(
        IssueDetail,
        {
          owner: "mean-weasel",
          repoName: "issuectl-test-repo-2",
          repoId: 42,
          currentPriority: "normal",
          issue: issue(),
          repoLocalPath: "/Users/neonwatty/Desktop/issuectl-test-repo-2",
          deployments: [endedDeployment],
          referencedFiles: [],
          defaultAgent: "codex",
          availableLabels: [],
          webhookHealth: null,
        },
        createElement(CompletedSessionCard, {
          owner: "mean-weasel",
          repo: "issuectl-test-repo-2",
          targetType: "issue",
          targetNumber: 35,
          deployment: endedDeployment,
        }),
      ),
    );

    expect(html).toContain("Launch with Codex");
    expect(html).toContain("Completed session #530");
    expect(html).toContain("Codex worked this issue");
    expect(html).toContain("View completed terminal");
    expect(html).toContain("Session history");
    expect(html).toContain("Verified webhook launch and clean completion.");
  });
});

function issue(overrides: Partial<GitHubIssue> = {}): GitHubIssue {
  return {
    number: 35,
    title: "Webhook completed session visibility",
    body: "Show prior agent work.",
    state: "open",
    labels: [],
    user: null,
    assignees: [],
    commentCount: 0,
    createdAt: "2026-05-28T11:00:00.000Z",
    updatedAt: "2026-05-28T11:10:05.000Z",
    closedAt: null,
    htmlUrl: "https://github.com/mean-weasel/issuectl-test-repo-2/issues/35",
    ...overrides,
  };
}

function deployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: 1,
    repoId: 42,
    issueNumber: 35,
    targetType: "issue",
    targetNumber: 35,
    agent: "codex",
    branchName: "issue-35-webhook-complete",
    workspaceMode: "worktree",
    workspacePath: "/Users/neonwatty/.issuectl/worktrees/issuectl-test-repo-2-issue-35",
    linkedPrNumber: null,
    state: "active",
    terminalBackend: "pty_bridge",
    triggeredBy: "webhook",
    parentDeploymentId: null,
    webhookDepth: 0,
    launchedAt: "2026-05-28T11:00:00.000Z",
    endedAt: "2026-05-28T11:10:05.000Z",
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

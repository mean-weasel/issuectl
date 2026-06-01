import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionsOverviewData, SessionListItem } from "@/lib/sessions-data";
import { SessionsReviewList } from "./SessionsReviewList";

describe("SessionsReviewList", () => {
  it("links active session rows to their exact terminal deployment", () => {
    const html = renderToStaticMarkup(
      createElement(SessionsReviewList, { data: sessionsData() }),
    );

    expect(html).toContain('href="/workbench?deployment=101"');
    expect(html).toContain('aria-label="Open terminal for session 101"');
    expect(html).not.toContain('href="/workbench?deployment=102"');
    expect(html.match(/\/workbench\?deployment=/g)).toHaveLength(1);
  });
});

function sessionsData(): SessionsOverviewData {
  return {
    initialized: true,
    filters: {
      tab: "sessions",
      q: "",
      repo: "",
      trigger: "all",
      state: "all",
      status: "all",
    },
    repos: [{ id: 1, fullName: "mean-weasel/issuectl" }],
    sessionGroups: [{
      key: "mean-weasel/issuectl:issue:507",
      repoFullName: "mean-weasel/issuectl",
      targetType: "issue",
      targetNumber: 507,
      targetLabel: "Issue #507",
      sessions: [
        session({ id: 101, endedAt: null }),
        session({ id: 102, endedAt: "2026-05-24T01:00:00.000Z" }),
      ],
    }],
    reviewGroups: [],
    summary: {
      activeSessions: 1,
      endedSessions: 1,
      reviewRuns: 0,
      activeReviewRuns: 0,
    },
  };
}

function session(input: { id: number; endedAt: string | null }): SessionListItem {
  return {
    id: input.id,
    repoId: 1,
    repoFullName: "mean-weasel/issuectl",
    owner: "mean-weasel",
    repoName: "issuectl",
    targetType: "issue",
    targetNumber: 507,
    targetLabel: "Issue #507",
    issueNumber: 507,
    branchName: `issue-507-${input.id}`,
    agent: "codex",
    workspaceMode: "worktree",
    workspacePath: `/tmp/worktree-${input.id}`,
    linkedPrNumber: null,
    terminalBackend: "ttyd",
    triggeredBy: "webhook",
    parentDeploymentId: null,
    childDeploymentCount: 0,
    webhookDepth: 1,
    terminalReason: input.endedAt ? "completed" : null,
    launchedAt: "2026-05-24T00:00:00.000Z",
    endedAt: input.endedAt,
    ttydPort: input.endedAt ? null : 7101,
    idleSince: null,
    preview: null,
  };
}

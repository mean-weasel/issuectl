import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionsOverviewData } from "@/lib/sessions-data";
import { SessionsReviewList } from "./SessionsReviewList";

describe("SessionsReviewList review timestamps", () => {
  it("renders PR review run timestamps as stored millisecond values", () => {
    const html = renderToStaticMarkup(
      createElement(SessionsReviewList, { data: sessionsData() }),
    );

    expect(html).toContain("May 24");
    expect(html).toContain("01:00");
    expect(html).toContain("01:10");
    expect(html).not.toContain("Jan 21");
  });
});

function sessionsData(): SessionsOverviewData {
  return {
    initialized: true,
    filters: {
      tab: "reviews",
      q: "",
      repo: "",
      trigger: "all",
      state: "all",
      status: "all",
    },
    repos: [{ id: 1, fullName: "mean-weasel/issuectl" }],
    sessionGroups: [],
    reviewGroups: [{
      key: "1:44",
      repoFullName: "mean-weasel/issuectl",
      owner: "mean-weasel",
      repoName: "issuectl",
      prNumber: 44,
      matchingRunCount: 1,
      runs: [{
        id: 1,
        repoId: 1,
        prNumber: 44,
        deploymentId: null,
        startedHeadSha: "ccccccc3333333",
        completedHeadSha: "ccccccc3333333",
        reviewBaseSha: "aaaaaaa1111111",
        reviewedFromSha: "bbbbbbb2222222",
        reviewedToSha: "ccccccc3333333",
        headRepoFullName: "mean-weasel/issuectl",
        headRef: "feature/review",
        status: "completed",
        triggeredBy: "webhook",
        resultJson: null,
        startedAt: Date.UTC(2026, 4, 24, 8, 0, 0),
        completedAt: Date.UTC(2026, 4, 24, 8, 10, 0),
        repoFullName: "mean-weasel/issuectl",
        owner: "mean-weasel",
        repoName: "issuectl",
        deployment: null,
        result: {},
        summary: null,
        findingCount: null,
        rangeLabel: "bbbbbbb..ccccccc",
        detailHref: "/reviews/1",
        provenanceLabel: "webhook · no linked session",
        elapsedLabel: "10m",
      }],
    }],
    summary: {
      activeSessions: 0,
      endedSessions: 0,
      reviewRuns: 1,
      activeReviewRuns: 0,
    },
  };
}

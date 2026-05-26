import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewDetailData } from "@/lib/review-detail-data";
import { ReviewDetailPanel } from "./ReviewDetailPanel";

describe("ReviewDetailPanel", () => {
  it("renders PR review timestamps as stored millisecond values", () => {
    const html = renderToStaticMarkup(
      createElement(ReviewDetailPanel, {
        data: reviewDetailData(),
        retryAction: () => undefined,
        fullRerunAction: () => undefined,
      }),
    );

    expect(html).toContain("May 24");
    expect(html).toContain("01:00");
    expect(html).toContain("01:10");
    expect(html).not.toContain("Jan 21");
  });
});

function reviewDetailData(): ReviewDetailData {
  return {
    initialized: true,
    review: {
      id: 1,
      repoId: 1,
      prNumber: 44,
      deploymentId: 12,
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
    },
    repo: {
      id: 1,
      owner: "mean-weasel",
      name: "issuectl",
      localPath: "/tmp/issuectl",
      branchPattern: null,
      autoLaunchIssues: false,
      autoReviewPrs: true,
      issueAgent: "codex",
      reviewAgent: "codex",
      webhookId: 1,
      reviewPreamble: null,
      webhookPayloadMode: "metadata",
      createdAt: "2026-05-24T00:00:00.000Z",
    },
    deployment: null,
    lineage: [{
      id: 1,
      repoId: 1,
      prNumber: 44,
      deploymentId: 12,
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
      active: true,
      result: {},
      label: "bbbbbbb..ccccccc",
    }],
    diagnostics: [],
    result: {},
    deploymentResult: {},
    metadata: {
      currentReviewPreamble: null,
      triggerEvent: null,
    },
    banners: [],
    actions: {
      canRetry: true,
      canFullRerun: true,
      disabledReason: null,
    },
    links: {
      githubPr: "https://github.com/mean-weasel/issuectl/pull/44",
      githubReview: null,
      githubReviewFiles: "https://github.com/mean-weasel/issuectl/pull/44/files",
      workbench: "/workbench?repo=mean-weasel%2Fissuectl",
      repoSettings: "/repos/mean-weasel/issuectl/settings",
      sessions: "/sessions?tab=reviews",
      webhookLogs: "/logs/webhooks",
      diagnosticsCli: "issuectl diag show",
    },
  };
}

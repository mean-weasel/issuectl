import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { initSchema, seedDefaults } from "@issuectl/core";
import { launchPrFromWebhook } from "./webhook-pr-launch.js";
import type { PrReviewRecord, PullState } from "./webhook-pr-intent.js";

const executeLaunch = vi.hoisted(() => vi.fn(async () => ({ deploymentId: 12 })));

vi.mock("@issuectl/core", async () => {
  const actual = await vi.importActual<typeof import("@issuectl/core")>("@issuectl/core");
  return {
    ...actual,
    executeLaunch: (db: unknown, octokit: unknown, options: unknown) =>
      (executeLaunch as unknown as (...args: unknown[]) => unknown)(db, octokit, options),
    withAuthRetry: async (fn: (octokit: unknown) => unknown) => fn("octokit"),
  };
});

describe("launchPrFromWebhook", () => {
  it("passes the reserved incremental review range into production launch options", async () => {
    const db = new Database(":memory:");
    initSchema(db);
    seedDefaults(db);
    const pull: PullState = {
      title: "Review me",
      body: null,
      state: "open",
      draft: false,
      labels: ["issuectl:auto-review"],
      headRef: "feature/webhooks",
      baseRef: "main",
      headSha: "head-c",
      baseSha: "base-a",
      headRepoFullName: "mean-weasel/issuectl",
      baseRepoFullName: "mean-weasel/issuectl",
      defaultBranch: "main",
    };
    const review: PrReviewRecord = {
      id: 7,
      repoId: 1,
      prNumber: 44,
      deploymentId: null,
      status: "reserved",
      reviewedFromSha: "head-b",
      reviewedToSha: "head-c",
      completedHeadSha: null,
      resultJson: null,
    };

    await launchPrFromWebhook(
      db,
      repo(),
      intent(),
      pull,
      review,
    );

    expect(executeLaunch).toHaveBeenCalledWith(
      db,
      "octokit",
      expect.objectContaining({
        targetType: "pr",
        targetNumber: 44,
        agent: "codex",
        reviewedFromSha: "head-b",
        reviewedToSha: "head-c",
      }),
    );
  });
});

function repo() {
  return {
    id: 1,
    owner: "mean-weasel",
    name: "issuectl",
    localPath: "/tmp/repo",
    branchPattern: null,
    autoLaunchIssues: false,
    autoReviewPrs: true,
    issueAgent: "claude" as const,
    reviewAgent: "claude" as const,
    webhookId: null,
    reviewPreamble: null,
    webhookPayloadMode: "metadata" as const,
    createdAt: "2026-05-24T00:00:00Z",
  };
}

function intent() {
  return {
    id: 3,
    repoId: 1,
    targetType: "pr" as const,
    targetNumber: 44,
    firstSignalAt: 1,
    lastSignalAt: 1,
    scheduledAt: 1,
    processingStartedAt: 1,
    leaseExpiresAt: 2,
    generation: 1,
    desiredHeadSha: "head-c",
    requestedAgent: "codex" as const,
    reviewMode: null,
    signalCount: 1,
    status: "processing" as const,
    resolvedAt: null,
    deploymentId: null,
    failureReason: null,
  };
}

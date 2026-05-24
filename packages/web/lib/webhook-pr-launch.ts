import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  executeLaunch,
  generateBranchName,
  withAuthRetry,
} from "@issuectl/core";
import type { Repo, WebhookIntent } from "@issuectl/core";
import type {
  LaunchPrReview,
  PrReviewRecord,
  PullState,
} from "./webhook-pr-intent";
import { getLatestIntentEvent, triggeredByForIntentEvent } from "./webhook-intent-source";

export const launchPrFromWebhook: LaunchPrReview = async (
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  pull: PullState,
  review: PrReviewRecord,
): Promise<{ deploymentId: number }> => {
  const triggeredBy = triggeredByForIntentEvent(getLatestIntentEvent(db, intent.id));
  const options = {
    owner: repo.owner,
    repo: repo.name,
    targetType: "pr",
    targetNumber: intent.targetNumber,
    agent: repo.reviewAgent,
    branchName: generateBranchName("pr-{number}-{slug}", intent.targetNumber, pull.title),
    workspaceMode: repo.localPath ? "worktree" : "clone",
    selectedComments: [],
    selectedFiles: [],
    preamble: repo.reviewPreamble ?? undefined,
    triggeredBy,
    completionToken: randomUUID(),
    reviewedFromSha: review.reviewedFromSha,
    reviewedToSha: review.reviewedToSha,
    correlationId: `webhook-pr-intent:${intent.id}`,
  };
  return withAuthRetry((octokit) =>
    executeLaunch(
      db,
      octokit,
      options as unknown as Parameters<typeof executeLaunch>[2],
    ),
  );
};

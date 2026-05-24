import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { setAgentActionBudget } from "../db/agent-mutations.js";
import { getIssueDetail } from "../data/issues.js";
import { getPullDetail } from "../data/pulls.js";
import type { DeploymentTargetType, DeploymentTriggeredBy } from "../types.js";
import {
  assembleContext,
  assemblePrReviewContext,
  type LaunchContext,
  type PrReviewContext,
} from "./context.js";
import type { LaunchOptions } from "./launch.js";

export async function buildIssueLaunchContext(
  db: Database.Database,
  octokit: Octokit,
  options: LaunchOptions,
  issueNumber: number,
): Promise<{ contextString: string; expectedHeadRef?: string; expectedHeadSha?: string }> {
  const detail = await getIssueDetail(db, octokit, options.owner, options.repo, issueNumber);
  const filteredComments = options.selectedComments.map((i) => {
    const c = detail.comments[i];
    if (!c) throw new Error(`Comment index ${i} out of range`);
    return { author: c.user?.login ?? "unknown", body: c.body, createdAt: c.createdAt };
  });
  const filteredFiles =
    options.selectedFiles.length > 0 ? options.selectedFiles : detail.referencedFiles;
  const launchContext: LaunchContext = {
    issueNumber,
    issueTitle: detail.issue.title,
    issueBody: detail.issue.body ?? "",
    comments: filteredComments,
    referencedFiles: filteredFiles,
    preamble: options.preamble,
  };
  return { contextString: assembleContext(launchContext) };
}

export async function buildPrLaunchContext(
  db: Database.Database,
  octokit: Octokit,
  options: LaunchOptions,
  prNumber: number,
): Promise<{ contextString: string; expectedHeadRef: string; expectedHeadSha: string }> {
  const detail = await getPullDetail(db, octokit, options.owner, options.repo, prNumber, {
    forceRefresh: true,
  });
  const pull = detail.pull;
  if (!pull.headSha) throw new Error(`PR #${prNumber} is missing head SHA`);
  const reviewedFromSha = options.reviewedFromSha ?? null;
  const reviewedToSha = options.reviewedToSha ?? pull.headSha;
  const launchContext: PrReviewContext = {
    owner: options.owner,
    repo: options.repo,
    prNumber,
    title: pull.title,
    body: pull.body,
    mode: reviewedFromSha ? "incremental" : "full",
    headRef: pull.headRef,
    baseRef: pull.baseRef,
    reviewBaseSha: pull.baseSha ?? "",
    reviewedFromSha,
    reviewedToSha,
    files: detail.files.map((file) => ({
      filename: file.filename,
      status: file.status,
      patch: file.patch,
    })),
    comments: detail.reviews.filter((review) => review.body.length > 0).map((review) => ({
      author: review.user?.login ?? "unknown",
      body: review.body,
      createdAt: review.submittedAt ?? "",
    })),
    preamble: options.preamble,
  };
  return {
    contextString: assemblePrReviewContext(launchContext),
    expectedHeadRef: pull.headRef,
    expectedHeadSha: reviewedToSha,
  };
}

export function seedAgentActionBudgets(
  db: Database.Database,
  deploymentId: number,
  targetType: DeploymentTargetType,
  triggeredBy: DeploymentTriggeredBy | undefined,
): void {
  if (targetType !== "pr") return;
  if (triggeredBy !== "webhook" && triggeredBy !== "comment_command") return;
  setAgentActionBudget(db, deploymentId, "comment", 1);
  setAgentActionBudget(db, deploymentId, "label", 2);
  setAgentActionBudget(db, deploymentId, "create_issue", 1);
  setAgentActionBudget(db, deploymentId, "create_pr", 1);
  setAgentActionBudget(db, deploymentId, "push", 1);
}

export function buildAgentEnvironment(input: {
  completionToken: string | null;
  deploymentId: number;
  repoId: number;
  targetType: DeploymentTargetType;
  targetNumber: number;
  expectedHeadRef?: string;
  expectedHeadSha?: string;
}): Record<string, string> {
  if (!input.completionToken) return {};
  return {
    ISSUECTL_AGENT_TOKEN: input.completionToken,
    ISSUECTL_DEPLOYMENT_ID: String(input.deploymentId),
    ISSUECTL_REPO_ID: String(input.repoId),
    ISSUECTL_TARGET_TYPE: input.targetType,
    ISSUECTL_TARGET_NUMBER: String(input.targetNumber),
    ...(input.expectedHeadRef ? { ISSUECTL_EXPECTED_HEAD_REF: input.expectedHeadRef } : {}),
    ...(input.expectedHeadSha ? { ISSUECTL_EXPECTED_HEAD_SHA: input.expectedHeadSha } : {}),
  };
}

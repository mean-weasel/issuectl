import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import type { GitHubIssue, GitHubPull } from "../github/types.js";
import {
  LIFECYCLE_LABEL,
  addLabel,
  removeLabel,
  ensureLifecycleLabels,
} from "../github/labels.js";
import { getRepo } from "../db/repos.js";
import {
  getDeploymentsForIssue,
  getDeploymentsByRepo,
  updateLinkedPR,
} from "../db/deployments.js";
import { matchLinkedPRs } from "./detect.js";

export type LinkedPRState = "open" | "closed" | "merged";

type LifecycleLabelValue = (typeof LIFECYCLE_LABEL)[keyof typeof LIFECYCLE_LABEL];

export type ReconcileResult = {
  labelsAdded: LifecycleLabelValue[];
  labelsRemoved: LifecycleLabelValue[];
  linkedPR: { number: number; state: LinkedPRState } | null;
};

/**
 * Reconcile lifecycle labels for a single deployed issue.
 *
 * Accepts pre-fetched issue and linkedPRs so callers can share
 * data they have already retrieved, avoiding redundant API calls.
 * No-ops if the issue lacks the `issuectl:deployed` label or has
 * no linked PRs.
 */
export async function reconcileIssueLifecycle(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  issue: GitHubIssue,
  linkedPRs: GitHubPull[],
): Promise<ReconcileResult> {
  const currentLabels = issue.labels.map((l) => l.name);

  if (!currentLabels.includes(LIFECYCLE_LABEL.deployed)) {
    return { labelsAdded: [], labelsRemoved: [], linkedPR: null };
  }

  const mergedPR = linkedPRs.find((pr) => pr.merged);
  const openPR = linkedPRs.find((pr) => pr.state === "open");
  const linkedPR = mergedPR ?? openPR ?? null;

  if (!linkedPR) {
    return { labelsAdded: [], labelsRemoved: [], linkedPR: null };
  }

  const repoRecord = getRepo(db, owner, repo);
  if (repoRecord) {
    const deployments = getDeploymentsForIssue(
      db,
      repoRecord.id,
      issue.number,
    );
    for (const dep of deployments) {
      if (dep.linkedPrNumber !== linkedPR.number) {
        updateLinkedPR(db, dep.id, linkedPR.number);
      }
    }
  }

  const hasLabel = (name: string) => currentLabels.includes(name);
  const toAdd: LifecycleLabelValue[] = [];
  const toRemove: LifecycleLabelValue[] = [];

  if (linkedPR.merged) {
    if (hasLabel(LIFECYCLE_LABEL.prOpen)) {
      toRemove.push(LIFECYCLE_LABEL.prOpen);
    }
    if (issue.state === "closed" && !hasLabel(LIFECYCLE_LABEL.done)) {
      toAdd.push(LIFECYCLE_LABEL.done);
    }
  } else if (linkedPR.state === "open") {
    if (!hasLabel(LIFECYCLE_LABEL.prOpen)) {
      toAdd.push(LIFECYCLE_LABEL.prOpen);
    }
  }

  if (toAdd.length > 0 || toRemove.length > 0) {
    await ensureLifecycleLabels(octokit, owner, repo);
    await Promise.all([
      ...toRemove.map((l) => removeLabel(octokit, owner, repo, issue.number, l)),
      ...toAdd.map((l) => addLabel(octokit, owner, repo, issue.number, l)),
    ]);
  }

  const state: LinkedPRState = linkedPR.merged ? "merged" : linkedPR.state;
  return { labelsAdded: toAdd, labelsRemoved: toRemove, linkedPR: { number: linkedPR.number, state } };
}

/**
 * Reconcile lifecycle labels for all deployed issues in a repo.
 *
 * Accepts pre-fetched issues and pulls to avoid redundant API calls.
 * Ensures lifecycle labels exist on the repo first.
 */
const inflightRepos = new Set<string>();

export async function reconcileRepoLifecycle(
  db: Database.Database,
  octokit: Octokit,
  owner: string,
  repo: string,
  issues: GitHubIssue[],
  pulls: GitHubPull[],
): Promise<void> {
  const key = `${owner}/${repo}`;
  if (inflightRepos.has(key)) return;
  inflightRepos.add(key);
  try {
    const repoRecord = getRepo(db, owner, repo);
    if (!repoRecord) {
      console.warn(`[issuectl] Repo ${owner}/${repo} not found in DB during reconciliation — skipping`);
      return;
    }

    const deployments = getDeploymentsByRepo(db, repoRecord.id);
    if (deployments.length === 0) return;

    await ensureLifecycleLabels(octokit, owner, repo);

    const deployedIssueNumbers = new Set(deployments.map((d) => d.issueNumber));
    const deployedIssues = issues.filter((i) =>
      deployedIssueNumbers.has(i.number),
    );

    await Promise.all(
      deployedIssues.map(async (issue) => {
        try {
          const linked = matchLinkedPRs(pulls, issue.number);
          await reconcileIssueLifecycle(db, octokit, owner, repo, issue, linked);
        } catch (err) {
          console.warn(
            `[issuectl] Failed to reconcile issue #${issue.number}:`,
            err,
          );
        }
      }),
    );
  } finally {
    inflightRepos.delete(key);
  }
}

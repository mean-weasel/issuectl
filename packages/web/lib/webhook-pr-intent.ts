import type Database from "better-sqlite3";
import {
  endDeployment,
  killTmuxSession,
  killTtyd,
  recordDiagnosticEventSafely,
  tmuxSessionName,
  withAuthRetry,
} from "@issuectl/core";
import type { Repo, WebhookIntent } from "@issuectl/core";
import type { WebhookIntentWorkerResult } from "./webhook-intent-worker";
import { getLatestIntentEvent, triggeredByForIntentEvent } from "./webhook-intent-source";
import { planPrReview } from "./webhook-pr-review-state";
import { broadcastWebhookEventsChanged } from "./webhook-events-stream";

export type PullState = {
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  labels: string[];
  headRef: string;
  baseRef: string;
  headSha: string;
  baseSha: string;
  headRepoFullName: string;
  baseRepoFullName: string;
  defaultBranch: string;
  headProtected?: boolean;
};
export type FetchPullState = (repo: Repo, prNumber: number) => Promise<PullState>;
export type PrReviewRecord = {
  id: number;
  repoId: number;
  prNumber: number;
  deploymentId: number | null;
  status: string;
  reviewedFromSha: string | null;
  reviewedToSha: string;
  completedHeadSha: string | null;
  resultJson: string | null;
};
export type LaunchPrReview = (
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  pull: PullState,
  review: PrReviewRecord,
) => Promise<{ deploymentId: number }>;
export type PullWorkerDeps = {
  fetchPullState?: FetchPullState;
  launchPr?: LaunchPrReview;
  isAncestor?: (repo: Repo, baseSha: string, headSha: string) => Promise<boolean>;
  broadcastEventsChanged?: () => void;
};

export async function handlePullRequestIntent(
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  now: number,
  base: Pick<WebhookIntentWorkerResult, "recovered" | "expired" | "prunedPayloads">,
  deps: PullWorkerDeps,
): Promise<WebhookIntentWorkerResult> {
  let review: PrReviewRecord | undefined;
  const broadcastEventsChanged = deps.broadcastEventsChanged ?? broadcastWebhookEventsChanged;
  try {
    const pull = await (deps.fetchPullState ?? fetchPullState)(repo, intent.targetNumber);
    const event = getLatestIntentEvent(db, intent.id);
    const triggeredBy = triggeredByForIntentEvent(event);
    if (triggeredBy === "webhook" && !isPullGatedIn(repo, pull)) {
      const endedSessions = endWebhookPrSessionForTarget(db, repo, intent, now, terminalReasonForPrOptOut(repo, pull, event));
      recordPrIntentDiagnostic(db, repo, intent, "webhook.skipped_optout", endedSessions > 0 ? "Ended webhook-launched PR review session." : "PR is not opted in for auto-review.");
      markIntentTerminal(db, intent.id, now, "PR is not opted in");
      broadcastEventsChanged();
      return result(base, { claimed: 1, skippedOptout: 1, endedSessions });
    }
    if (triggeredBy === "webhook" && !isSafeWebhookPullForReservation(pull, intent.desiredHeadSha)) {
      recordPrIntentDiagnostic(db, repo, intent, "webhook.skipped_unsafe_pr", "PR failed auto-review safety gates.");
      markIntentTerminal(db, intent.id, now, "PR failed safety gates");
      broadcastEventsChanged();
      return result(base, { claimed: 1, skippedOptout: 1 });
    }
    if (triggeredBy !== "webhook" && !isSafePullForReservation(pull, intent.desiredHeadSha)) {
      recordPrIntentDiagnostic(db, repo, intent, "webhook.skipped_unsafe_pr", "PR failed auto-review safety gates.");
      markIntentTerminal(db, intent.id, now, "PR failed safety gates");
      broadcastEventsChanged();
      return result(base, { claimed: 1, skippedOptout: 1 });
    }
    if (!deps.launchPr) throw new Error("PR launch dependency is not configured");
    const plan = await planPrReview(db, repo, intent, pull, now, deps, triggeredBy);
    recordPrIntentDiagnostic(
      db,
      repo,
      intent,
      "webhook.lock_check",
      plan.action === "skip" ? plan.reason : "PR has no active review blocking launch.",
    );
    if (plan.action === "skip") {
      markIntentSkippedLocked(db, intent.id, now, plan.reason);
      recordPrIntentDiagnostic(db, repo, intent, plan.event, plan.reason);
      broadcastEventsChanged();
      return result(base, { claimed: 1, skippedLocked: 1 });
    }
    review = plan.review;
    markPrReviewLaunching(db, review.id);
    broadcastEventsChanged();
    review = { ...review, status: "launching" };
    const launch = await deps.launchPr(db, repo, intent, pull, review);
    markPrReviewInProgress(db, review.id, launch.deploymentId);
    markIntentLaunched(db, intent.id, now, launch.deploymentId);
    recordPrIntentDiagnostic(db, repo, intent, "webhook.launched", "Webhook launched PR review session.", launch.deploymentId);
    recordPrIntentDiagnostic(db, repo, intent, "webhook.pr_launched", "Webhook launched PR review session.", launch.deploymentId);
    broadcastEventsChanged();
    return result(base, { claimed: 1, launched: 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (review) markPrReviewFailed(db, review.id, now, message);
    markIntentFailed(db, intent.id, now, message);
    recordPrIntentDiagnostic(db, repo, intent, "webhook.launch_failed", message);
    broadcastEventsChanged();
    return result(base, { claimed: 1, failed: 1 });
  }
}

function terminalReasonForPrOptOut(
  repo: Repo,
  pull: PullState,
  event: { eventType: string; action: string | null } | null,
): "closed" | "killed_by_label" | "ended_manual" {
  if (pull.state === "closed" || event?.action === "closed") return "closed";
  if (event?.action === "unlabeled" || !repo.autoReviewPrs) return "killed_by_label";
  return "ended_manual";
}

function endWebhookPrSessionForTarget(
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  now: number,
  terminalReason: "closed" | "killed_by_label" | "ended_manual",
): number {
  const row = db.prepare(
    `SELECT r.id AS review_id, d.id AS deployment_id, d.ttyd_pid, d.terminal_backend
     FROM pr_reviews r
     JOIN deployments d ON d.id = r.deployment_id
     WHERE r.repo_id = ? AND r.pr_number = ?
       AND r.status IN ('reserved', 'launching', 'in_progress')
       AND d.ended_at IS NULL
       AND d.triggered_by = 'webhook'
     ORDER BY r.started_at DESC, r.id DESC
     LIMIT 1`,
  ).get(repo.id, intent.targetNumber) as {
    review_id: number;
    deployment_id: number;
    ttyd_pid: number | null;
    terminal_backend: string | null;
  } | undefined;
  if (!row) return 0;

  const sessionName = (tmuxSessionName as (
    repo: string,
    targetNumber: number,
    targetType?: "issue" | "pr",
  ) => string)(repo.name, intent.targetNumber, "pr");
  if (row.ttyd_pid) killTtyd(row.ttyd_pid, sessionName);
  else if (row.terminal_backend === "pty_bridge") killTmuxSession(sessionName);
  (endDeployment as (
    db: Database.Database,
    deploymentId: number,
    reason?: "closed" | "killed_by_label" | "ended_manual",
  ) => void)(db, row.deployment_id, terminalReason);
  db.prepare(
    "UPDATE pr_reviews SET status = 'superseded', completed_at = ?, result_json = ? WHERE id = ?",
  ).run(now, JSON.stringify({ reason: terminalReason }), row.review_id);
  recordPrIntentDiagnostic(db, repo, intent, "webhook.pr_session_ended", "Ended webhook PR review session.", row.deployment_id);
  return 1;
}

async function fetchPullState(repo: Repo, prNumber: number): Promise<PullState> {
  return withAuthRetry(async (octokit) => {
    const { data } = await octokit.rest.pulls.get({
      owner: repo.owner,
      repo: repo.name,
      pull_number: prNumber,
    });
    const d = data as typeof data & {
      labels?: Array<string | { name?: string | null }>;
      head: { ref: string; sha: string; repo: { full_name: string } | null };
      base: { ref: string; sha: string; repo: { full_name: string; default_branch?: string } | null };
    };
    const headRepoFullName = d.head.repo?.full_name ?? "";
    const baseRepoFullName = d.base.repo?.full_name ?? `${repo.owner}/${repo.name}`;
    const headProtected = headRepoFullName === baseRepoFullName
      ? Boolean((await octokit.rest.repos.getBranch({
        owner: repo.owner,
        repo: repo.name,
        branch: d.head.ref,
      })).data.protected)
      : false;
    return {
      title: d.title, body: d.body ?? null, state: d.state, draft: Boolean(d.draft),
      labels: (d.labels ?? []).map((l) => typeof l === "string" ? l : l.name).filter((n): n is string => Boolean(n)),
      headRef: d.head.ref, baseRef: d.base.ref, headSha: d.head.sha, baseSha: d.base.sha,
      headRepoFullName,
      baseRepoFullName,
      defaultBranch: d.base.repo?.default_branch ?? d.base.ref,
      headProtected,
    };
  });
}

function isPullGatedIn(repo: Repo, pull: PullState): boolean {
  return repo.autoReviewPrs && pull.state === "open" && !pull.draft && pull.labels.includes("issuectl:auto-review");
}

function isSafePullForReservation(pull: PullState, desiredHeadSha: string | null): boolean {
  return pull.headRepoFullName === pull.baseRepoFullName
    && pull.headRef !== pull.defaultBranch
    && (desiredHeadSha === null || pull.headSha === desiredHeadSha);
}

function isSafeWebhookPullForReservation(pull: PullState, desiredHeadSha: string | null): boolean {
  return isSafePullForReservation(pull, desiredHeadSha)
    && pull.headProtected !== true;
}

function markPrReviewLaunching(db: Database.Database, reviewId: number): void {
  db.prepare("UPDATE pr_reviews SET status = 'launching' WHERE id = ?").run(reviewId);
}

function markPrReviewInProgress(db: Database.Database, reviewId: number, deploymentId: number): void {
  db.prepare(
    "UPDATE pr_reviews SET status = 'in_progress', deployment_id = ? WHERE id = ?",
  ).run(deploymentId, reviewId);
}

function markPrReviewFailed(db: Database.Database, reviewId: number, now: number, message: string): void {
  db.prepare(
    "UPDATE pr_reviews SET status = 'failed', completed_at = ?, result_json = ? WHERE id = ?",
  ).run(now, JSON.stringify({ error: message }), reviewId);
}

function markIntentLaunched(db: Database.Database, intentId: number, now: number, deploymentId: number): void {
  db.prepare(
    `UPDATE webhook_intents
     SET status = 'launched', resolved_at = ?, processing_started_at = NULL,
         lease_expires_at = NULL, deployment_id = ?, failure_reason = NULL
     WHERE id = ? AND status = 'processing'`,
  ).run(now, deploymentId, intentId);
}

function markIntentSkippedLocked(db: Database.Database, intentId: number, now: number, failureReason: string): void {
  db.prepare(
    `UPDATE webhook_intents
     SET status = 'skipped_locked', resolved_at = ?, processing_started_at = NULL,
         lease_expires_at = NULL, deployment_id = NULL, failure_reason = ?
     WHERE id = ? AND status = 'processing'`,
  ).run(now, failureReason, intentId);
}

function markIntentTerminal(db: Database.Database, intentId: number, now: number, failureReason: string): void {
  db.prepare(
    `UPDATE webhook_intents
     SET status = 'skipped_optout', resolved_at = ?, processing_started_at = NULL,
         lease_expires_at = NULL, deployment_id = NULL, failure_reason = ?
     WHERE id = ? AND status = 'processing'`,
  ).run(now, failureReason, intentId);
}

function markIntentFailed(db: Database.Database, intentId: number, now: number, failureReason: string): void {
  db.prepare(
    `UPDATE webhook_intents
     SET status = 'failed', resolved_at = ?, processing_started_at = NULL,
         lease_expires_at = NULL, failure_reason = ?
     WHERE id = ? AND status = 'processing'`,
  ).run(now, failureReason, intentId);
}

function recordPrIntentDiagnostic(db: Database.Database, repo: Repo, intent: WebhookIntent, event: string, message: string, deploymentId?: number): void {
  recordDiagnosticEventSafely(db, {
    level: event.endsWith("_failed") ? "error" : "info",
    event,
    source: "webhook-worker",
    owner: repo.owner,
    repo: repo.name,
    targetType: "pr",
    targetNumber: intent.targetNumber,
    deploymentId,
    message,
    data: {
      intentId: intent.id,
      targetType: intent.targetType,
      targetNumber: intent.targetNumber,
      generation: intent.generation,
    },
  });
}

function result(
  base: Pick<WebhookIntentWorkerResult, "recovered" | "expired" | "prunedPayloads">,
  values: Partial<WebhookIntentWorkerResult> = {},
): WebhookIntentWorkerResult {
  return {
    claimed: values.claimed ?? 0,
    recovered: base.recovered,
    expired: base.expired,
    prunedPayloads: base.prunedPayloads,
    launched: values.launched ?? 0,
    deferred: values.deferred ?? 0,
    skippedLocked: values.skippedLocked ?? 0,
    skippedOptout: values.skippedOptout ?? 0,
    failed: values.failed ?? 0,
    endedSessions: values.endedSessions ?? 0,
  };
}

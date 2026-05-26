/* eslint-disable max-lines */
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  claimDueWebhookIntent,
  executeLaunch,
  generateBranchName,
  hasLiveDeploymentForIssue,
  expireOldWebhookIntentRecords,
  getDeploymentById,
  getRepoById,
  getSetting,
  killTmuxSession,
  killTtyd,
  recordDiagnosticEventSafely,
  recoverExpiredWebhookIntentLeaseRecords,
  tmuxSessionName,
  withAuthRetry,
} from "@issuectl/core";
import type { Deployment, Repo, WebhookIntent } from "@issuectl/core";
import { handlePullRequestIntent } from "./webhook-pr-intent";
import type { FetchPullState, LaunchPrReview, PullWorkerDeps } from "./webhook-pr-intent";
import { getLatestIntentEvent, triggeredByForIntentEvent } from "./webhook-intent-source";
import type { IntentEventSummary } from "./webhook-intent-source";
import { launchPrFromWebhook } from "./webhook-pr-launch";
import { pruneExpiredWebhookData } from "./webhook-payload-retention";
import { enforceWebhookRunawayControls } from "./webhook-runaway-controls";
import { broadcastWebhookEventsChanged } from "./webhook-events-stream";
import { notifyDeploymentTerminalOutcome } from "./push/notifications";

export type WebhookIntentWorkerResult = {
  claimed: number; recovered: number; expired: number; prunedPayloads: number;
  launched: number; deferred: number; skippedLocked: number; skippedOptout: number; failed: number; endedSessions: number;
};

const DEFAULT_MAX_WEBHOOK_INTENT_AGE_MINUTES = 60;
const DEFAULT_BRANCH_PATTERN = "issue-{number}-{slug}";
const ISSUE_AUTO_LAUNCH_LABEL = "issuectl:auto-launch";
const WEBHOOK_WORKER_INTERVAL_MS = 10_000;
let webhookWorkerTimer: NodeJS.Timeout | undefined;

type IssueState = { title: string; state: string; labels: string[] };
type WorkerDeps = {
  fetchIssueState?: (repo: Repo, issueNumber: number) => Promise<IssueState>;
  fetchPullState?: FetchPullState;
  launchIssue?: (
    db: Database.Database,
    repo: Repo,
    intent: WebhookIntent,
    issue: IssueState,
    triggeredBy: "webhook" | "comment_command",
    completionToken: string,
  ) => Promise<{ deploymentId: number }>;
  launchPr?: LaunchPrReview;
  isAncestor?: PullWorkerDeps["isAncestor"];
  broadcastEventsChanged?: () => void;
};

function parseMaxWebhookIntentAgeMinutes(value: string | undefined): number {
  const parsed = Number(value ?? String(DEFAULT_MAX_WEBHOOK_INTENT_AGE_MINUTES));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MAX_WEBHOOK_INTENT_AGE_MINUTES;
  }
  return parsed;
}

export async function runWebhookIntentWorkerOnce(
  db: Database.Database,
  now = Date.now(),
  deps: WorkerDeps = {},
): Promise<WebhookIntentWorkerResult> {
  const recoveredPrReviews = recoverOrphanedActivePrReviews(db, now);
  for (const review of recoveredPrReviews) {
    recordPrReviewRecoveryDiagnostic(db, review);
  }
  const recoveredRecords = recoverExpiredWebhookIntentLeaseRecords(db, now);
  for (const recovered of recoveredRecords) {
    recordRecoveryDiagnostic(db, recovered, "webhook.intent_recovered", "Recovered expired webhook intent lease.");
  }
  const recovered = recoveredRecords.length;
  const maxAgeMinutes = parseMaxWebhookIntentAgeMinutes(
    getSetting(db, "max_webhook_intent_age_minutes"),
  );
  const expiredRecords = expireOldWebhookIntentRecords(db, now, maxAgeMinutes * 60_000);
  for (const expiredIntent of expiredRecords) {
    recordRecoveryDiagnostic(db, expiredIntent, "webhook.expired", "Expired stale webhook intent.");
  }
  const expired = expiredRecords.length;
  const retention = pruneExpiredWebhookData(db, now);
  const prunedPayloads = retention.prunedPayloads;
  const broadcastEventsChanged = deps.broadcastEventsChanged ?? broadcastWebhookEventsChanged;
  if (recoveredPrReviews.length > 0 || recovered > 0 || expired > 0 || prunedPayloads > 0 || retention.prunedEvents > 0) broadcastEventsChanged();
  const base = { recovered, expired, prunedPayloads };
  const intent = claimDueWebhookIntent(db, now, 60_000);
  if (!intent) return result(base);
  broadcastEventsChanged();

  const repo = getRepoById(db, intent.repoId);
  if (!repo) {
    markIntentTerminal(db, intent.id, "failed", now, "Repository not found");
    broadcastEventsChanged();
    return result(base, { claimed: 1, failed: 1 });
  }
  recordDiagnosticEventSafely(db, {
    level: "info",
    event: "webhook.intent_claimed",
    source: "webhook-worker",
    owner: repo?.owner,
    repo: repo?.name,
    issueNumber: intent.targetType === "issue" ? intent.targetNumber : undefined,
    targetType: intent.targetType,
    targetNumber: intent.targetNumber,
    data: {
      intentId: intent.id,
      targetType: intent.targetType,
      targetNumber: intent.targetNumber,
      generation: intent.generation,
      signalCount: intent.signalCount,
    },
  });

  if (intent.targetType === "pr") {
    const control = enforceWebhookRunawayControls(db, repo, intent, now);
    if (!control.allowed) {
      broadcastEventsChanged();
      return result(base, { claimed: 1, [control.outcome]: 1 });
    }
    return handlePullRequestIntent(db, repo, intent, now, base, {
      ...deps,
      launchPr: deps.launchPr ?? launchPrFromWebhook,
      broadcastEventsChanged,
    });
  }
  try {
    const issue = await (deps.fetchIssueState ?? fetchIssueState)(repo, intent.targetNumber);
    const event = getLatestIntentEvent(db, intent.id);
    const triggeredBy = triggeredByForIntentEvent(event);
    if (isIssueControlEvent(event) || (triggeredBy === "webhook" && repo.autoLaunchIssues === false)) {
      const endedSessions = endWebhookSessionForTarget(db, repo, intent, terminalReasonForControl(event));
      recordIntentDiagnostic(db, repo, intent, "webhook.kill_switch", endedSessions > 0 ? "Ended webhook-launched session." : "No webhook-launched session to end.");
      markIntentTerminal(db, intent.id, "skipped_optout", now, "Control event or repo auto-launch disabled");
      broadcastEventsChanged();
      return result(base, { claimed: 1, skippedOptout: 1, endedSessions });
    }
    if (triggeredBy === "webhook" && !isIssueGatedIn(repo, issue)) {
      recordIntentDiagnostic(db, repo, intent, "webhook.skipped_optout", "Issue is not opted in for auto-launch.");
      markIntentTerminal(db, intent.id, "skipped_optout", now, "Issue is not opted in");
      broadcastEventsChanged();
      return result(base, { claimed: 1, skippedOptout: 1 });
    }
    const locked = hasLiveDeploymentForIssue(db, repo.id, intent.targetNumber);
    recordIntentDiagnostic(
      db,
      repo,
      intent,
      "webhook.lock_check",
      locked ? "Issue already has a live session." : "Issue has no live session.",
    );
    if (locked) {
      recordIntentDiagnostic(db, repo, intent, "webhook.skipped_locked", "Issue already has a live session.");
      markIntentTerminal(db, intent.id, "skipped_locked", now, "Issue already has a live session");
      broadcastEventsChanged();
      return result(base, { claimed: 1, skippedLocked: 1 });
    }
    const control = enforceWebhookRunawayControls(db, repo, intent, now);
    if (!control.allowed) {
      broadcastEventsChanged();
      return result(base, { claimed: 1, [control.outcome]: 1 });
    }

    const completionToken = randomUUID();
    const launch = await (deps.launchIssue ?? launchIssueFromWebhook)(
      db,
      repo,
      intent,
      issue,
      triggeredBy,
      completionToken,
    );
    markIntentTerminal(db, intent.id, "launched", now, null, launch.deploymentId);
    recordIntentDiagnostic(db, repo, intent, "webhook.launched", "Webhook launched issue session.", launch.deploymentId);
    broadcastEventsChanged();
    return result(base, { claimed: 1, launched: 1 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    markIntentTerminal(db, intent.id, "failed", now, message);
    recordIntentDiagnostic(db, repo, intent, "webhook.launch_failed", message);
    broadcastEventsChanged();
    return result(base, { claimed: 1, failed: 1 });
  }
}

export function startWebhookIntentWorker(db: Database.Database, deps: WorkerDeps = {}): void {
  if (webhookWorkerTimer) return;

  webhookWorkerTimer = setInterval(() => {
    runWebhookIntentWorkerOnce(db, Date.now(), deps).catch((err: unknown) => {
      recordDiagnosticEventSafely(db, {
        level: "error",
        event: "webhook.worker_failed",
        source: "webhook-worker",
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }, WEBHOOK_WORKER_INTERVAL_MS);
  webhookWorkerTimer.unref();
}

function result(
  base: Pick<WebhookIntentWorkerResult, "recovered" | "expired" | "prunedPayloads">,
  values: Partial<WebhookIntentWorkerResult> = {},
): WebhookIntentWorkerResult {
  return {
    claimed: values.claimed ?? 0,
    recovered: base.recovered, expired: base.expired, prunedPayloads: base.prunedPayloads,
    launched: values.launched ?? 0, deferred: values.deferred ?? 0, skippedLocked: values.skippedLocked ?? 0,
    skippedOptout: values.skippedOptout ?? 0, failed: values.failed ?? 0,
    endedSessions: values.endedSessions ?? 0,
  };
}

async function fetchIssueState(repo: Repo, issueNumber: number): Promise<IssueState> {
  return withAuthRetry(async (octokit) => {
    const { data } = await octokit.rest.issues.get({
      owner: repo.owner,
      repo: repo.name,
      issue_number: issueNumber,
    });
    return {
      title: data.title,
      state: data.state,
      labels: data.labels.map((label) => typeof label === "string" ? label : label.name).filter((name): name is string => Boolean(name)),
    };
  });
}

async function launchIssueFromWebhook(
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  issue: IssueState,
  triggeredBy: "webhook" | "comment_command",
  completionToken: string,
): Promise<{ deploymentId: number }> {
  const branchPattern = repo.branchPattern ?? getSetting(db, "branch_pattern") ?? DEFAULT_BRANCH_PATTERN;
  const options = {
    owner: repo.owner,
    repo: repo.name,
    issueNumber: intent.targetNumber,
    agent: intent.requestedAgent ?? repo.issueAgent,
    branchName: generateBranchName(branchPattern, intent.targetNumber, issue.title),
    workspaceMode: repo.localPath ? "worktree" : "clone", selectedComments: [], selectedFiles: [],
    triggeredBy,
    completionToken,
    correlationId: `webhook-intent:${intent.id}`,
  } as Parameters<typeof executeLaunch>[2];
  return withAuthRetry((octokit) => executeLaunch(db, octokit, options));
}

function isIssueGatedIn(repo: Repo, issue: IssueState): boolean {
  return repo.autoLaunchIssues && issue.state === "open" && issue.labels.includes(ISSUE_AUTO_LAUNCH_LABEL);
}

function isIssueControlEvent(event: IntentEventSummary): boolean {
  return event?.eventType === "issues" && (event.action === "closed" || event.action === "unlabeled");
}

function markIntentTerminal(
  db: Database.Database,
  intentId: number,
  status: "launched" | "skipped_locked" | "skipped_optout" | "failed",
  now: number,
  failureReason: string | null,
  deploymentId: number | null = null,
): void {
  db.prepare(
    `UPDATE webhook_intents
     SET status = ?, resolved_at = ?, processing_started_at = NULL,
         lease_expires_at = NULL, deployment_id = COALESCE(?, deployment_id),
         failure_reason = ?
     WHERE id = ? AND status = 'processing'`,
  ).run(status, now, deploymentId, failureReason, intentId);
}

function findWebhookDeploymentForTarget(
  db: Database.Database,
  repoId: number,
  issueNumber: number,
): Deployment | undefined {
  const row = db.prepare(
    `SELECT i.deployment_id
     FROM webhook_intents i
     JOIN deployments d ON d.id = i.deployment_id
     WHERE i.repo_id = ? AND i.target_type = 'issue' AND i.target_number = ?
       AND i.status = 'launched' AND i.deployment_id IS NOT NULL
       AND d.triggered_by = 'webhook'
     ORDER BY i.resolved_at DESC, i.id DESC LIMIT 1`,
  ).get(repoId, issueNumber) as { deployment_id: number } | undefined;
  if (!row) return undefined;
  const deployment = getDeploymentById(db, row.deployment_id);
  return deployment?.endedAt === null && deployment.state === "active" ? deployment : undefined;
}

function terminalReasonForControl(event: IntentEventSummary): "closed" | "killed_by_label" {
  return event?.action === "closed" ? "closed" : "killed_by_label";
}

function endWebhookSessionForTarget(
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  terminalReason: "closed" | "killed_by_label",
): number {
  const deployment = findWebhookDeploymentForTarget(db, repo.id, intent.targetNumber);
  if (!deployment) return 0;
  const sessionName = tmuxSessionName(repo.name, intent.targetNumber);
  if (deployment.ttydPid) killTtyd(deployment.ttydPid, sessionName);
  else if (deployment.terminalBackend === "pty_bridge") killTmuxSession(sessionName);
  const transition = transitionDeploymentTerminal(db, deployment.id, terminalReason);
  if (!transition.changed) return 0;
  notifyDeploymentTerminalOutcome({ deploymentId: deployment.id });
  return 1;
}

function transitionDeploymentTerminal(
  db: Database.Database,
  deploymentId: number,
  terminalReason: "closed" | "killed_by_label",
): { changed: boolean } {
  const result = db.prepare(
    "UPDATE deployments SET ended_at = datetime('now'), idle_since = NULL, terminal_reason = COALESCE(?, terminal_reason) WHERE id = ? AND ended_at IS NULL",
  ).run(terminalReason, deploymentId);
  if (result.changes > 0) return { changed: true };
  const row = db.prepare("SELECT 1 FROM deployments WHERE id = ?").get(deploymentId);
  if (!row) throw new Error(`No deployment found with id ${deploymentId}`);
  return { changed: false };
}

function recoverOrphanedActivePrReviews(
  db: Database.Database,
  completedAt: number,
): Array<{ id: number; repoId: number; prNumber: number; deploymentId: number | null; status: string; resultJson: string | null }> {
  const rows = db.prepare(
    `SELECT r.id, r.repo_id, r.pr_number, r.deployment_id
     FROM pr_reviews r
     LEFT JOIN deployments d ON d.id = r.deployment_id
     WHERE r.status IN ('reserved', 'launching', 'in_progress')
       AND (
         r.deployment_id IS NULL
         OR d.id IS NULL
         OR d.state != 'active'
         OR d.ended_at IS NOT NULL
       )
     ORDER BY r.started_at ASC, r.id ASC`,
  ).all() as Array<{ id: number; repo_id: number; pr_number: number; deployment_id: number | null }>;
  const recovered = [];
  const update = db.prepare(
    `UPDATE pr_reviews
     SET status = ?,
         completed_at = ?,
         result_json = ?
     WHERE id = ?
       AND status IN ('reserved', 'launching', 'in_progress')`,
  );
  for (const row of rows) {
    const status = row.deployment_id === null ? "failed" : "superseded";
    const reason = row.deployment_id === null ? "orphaned_before_deployment" : "orphaned_deployment_terminal";
    update.run(status, completedAt, JSON.stringify({ reason }), row.id);
    recovered.push({
      id: row.id,
      repoId: row.repo_id,
      prNumber: row.pr_number,
      deploymentId: row.deployment_id,
      status,
      resultJson: JSON.stringify({ reason }),
    });
  }
  return recovered;
}

function recordIntentDiagnostic(
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  event: string,
  message: string,
  deploymentId?: number,
): void {
  recordDiagnosticEventSafely(db, {
    level: event.endsWith("_failed") ? "error" : "info",
    event,
    source: "webhook-worker",
    owner: repo.owner,
    repo: repo.name,
    issueNumber: intent.targetType === "issue" ? intent.targetNumber : undefined,
    targetType: intent.targetType,
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

function recordRecoveryDiagnostic(
  db: Database.Database,
  intent: WebhookIntent,
  event: "webhook.intent_recovered" | "webhook.expired",
  message: string,
): void {
  const repo = getRepoById(db, intent.repoId);
  recordDiagnosticEventSafely(db, {
    level: "warn",
    event,
    source: "webhook-worker",
    owner: repo?.owner,
    repo: repo?.name,
    issueNumber: intent.targetType === "issue" ? intent.targetNumber : undefined,
    targetType: intent.targetType,
    targetNumber: intent.targetNumber,
    status: intent.status,
    message,
    data: {
      intentId: intent.id,
      targetType: intent.targetType,
      targetNumber: intent.targetNumber,
      generation: intent.generation,
      signalCount: intent.signalCount,
    },
  });
}

function recordPrReviewRecoveryDiagnostic(
  db: Database.Database,
  review: { repoId: number; prNumber: number; deploymentId: number | null; status: string; resultJson: string | null },
): void {
  const repo = getRepoById(db, review.repoId);
  recordDiagnosticEventSafely(db, {
    level: "warn",
    event: "webhook.pr_review_recovered",
    source: "webhook-worker",
    owner: repo?.owner,
    repo: repo?.name,
    targetType: "pr",
    targetNumber: review.prNumber,
    deploymentId: review.deploymentId ?? undefined,
    status: review.status,
    message: "Recovered orphaned PR review lifecycle row.",
    data: {
      reviewId: (review as { id?: number }).id,
      result: parseRecoveryResult(review.resultJson),
    },
  });
}

function parseRecoveryResult(value: string | null): unknown {
  if (!value) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

export function stopWebhookIntentWorker(): void {
  if (webhookWorkerTimer) { clearInterval(webhookWorkerTimer); webhookWorkerTimer = undefined; }
}

import type Database from "better-sqlite3";
import {
  getSetting,
  countActiveWebhookIntents,
  recordDiagnosticEventSafely,
  type Repo,
  type WebhookIntent,
} from "@issuectl/core";

export type WebhookRunawayDecision =
  | { allowed: true }
  | { allowed: false; outcome: "deferred" | "failed"; reason: string };

const DEFAULT_MAX_LAUNCHES_PER_MINUTE = 5;
const DEFAULT_MAX_QUEUE_DEPTH = 100;
const DEFAULT_MAX_CONCURRENT_AGENTS = 2;
const DEFAULT_DEFER_MS = 10_000;

export function enforceWebhookRunawayControls(
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  now: number,
): WebhookRunawayDecision {
  const queueDepth = countActiveWebhookIntents(db);
  const maxQueueDepth = positiveSetting(
    getSetting(db, "max_webhook_queue_depth"),
    DEFAULT_MAX_QUEUE_DEPTH,
  );
  if (queueDepth > maxQueueDepth) {
    failIntent(db, repo, intent, now, "queue_depth_exceeded", { queueDepth, maxQueueDepth });
    return { allowed: false, outcome: "failed", reason: "queue_depth_exceeded" };
  }

  const activeAgents = countActiveWebhookAgents(db);
  const maxActiveAgents = positiveSetting(
    getSetting(db, "max_concurrent_webhook_agents"),
    DEFAULT_MAX_CONCURRENT_AGENTS,
  );
  if (activeAgents >= maxActiveAgents) {
    deferIntent(db, repo, intent, now, "concurrent_agents_exceeded", {
      activeAgents,
      maxActiveAgents,
    });
    return { allowed: false, outcome: "deferred", reason: "concurrent_agents_exceeded" };
  }

  const launchLimit = positiveSetting(
    getSetting(db, "max_webhook_launches_per_minute"),
    DEFAULT_MAX_LAUNCHES_PER_MINUTE,
  );
  const recentLaunch = recentLaunchStats(db, repo.id, now);
  if (recentLaunch.count >= launchLimit) {
    const deferUntil = (recentLaunch.oldestResolvedAt ?? now) + 60_001;
    deferIntent(db, repo, intent, now, "launch_rate_exceeded", {
      launchLimit,
      recentLaunches: recentLaunch.count,
      deferUntil,
    }, Math.max(DEFAULT_DEFER_MS, deferUntil - now));
    return { allowed: false, outcome: "deferred", reason: "launch_rate_exceeded" };
  }

  return { allowed: true };
}

function positiveSetting(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? String(fallback));
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

function countActiveWebhookAgents(db: Database.Database): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS count
     FROM deployments
     WHERE triggered_by IN ('webhook', 'comment_command')
       AND ended_at IS NULL`,
  ).get() as { count: number };
  return row.count;
}

function recentLaunchStats(
  db: Database.Database,
  repoId: number,
  now: number,
): { count: number; oldestResolvedAt: number | null } {
  const row = db.prepare(
    `SELECT COUNT(*) AS count, MIN(resolved_at) AS oldestResolvedAt
     FROM webhook_intents
     WHERE repo_id = ?
       AND status = 'launched'
       AND resolved_at IS NOT NULL
       AND resolved_at > ?`,
  ).get(repoId, now - 60_000) as { count: number; oldestResolvedAt: number | null };
  return row;
}

function failIntent(
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  now: number,
  reason: string,
  data: Record<string, unknown>,
): void {
  db.prepare(
    `UPDATE webhook_intents
     SET status = 'failed',
         resolved_at = ?,
         processing_started_at = NULL,
         lease_expires_at = NULL,
         failure_reason = ?
     WHERE id = ? AND status = 'processing'`,
  ).run(now, reason, intent.id);
  recordLimitDiagnostic(db, repo, intent, reason, data, "error");
}

function deferIntent(
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  now: number,
  reason: string,
  data: Record<string, unknown>,
  deferMs = DEFAULT_DEFER_MS,
): void {
  db.prepare(
    `UPDATE webhook_intents
     SET status = 'deferred',
         scheduled_at = ?,
         processing_started_at = NULL,
         lease_expires_at = NULL,
         failure_reason = ?
     WHERE id = ? AND status = 'processing'`,
  ).run(now + deferMs, reason, intent.id);
  recordLimitDiagnostic(db, repo, intent, reason, data, "warn");
}

function recordLimitDiagnostic(
  db: Database.Database,
  repo: Repo,
  intent: WebhookIntent,
  reason: string,
  data: Record<string, unknown>,
  level: "warn" | "error",
): void {
  recordDiagnosticEventSafely(db, {
    level,
    event: "webhook.runaway_limited",
    source: "webhook-worker",
    owner: repo.owner,
    repo: repo.name,
    issueNumber: intent.targetType === "issue" ? intent.targetNumber : undefined,
    targetType: intent.targetType,
    targetNumber: intent.targetNumber,
    status: reason,
    message: `Webhook launch blocked by ${reason}`,
    data: {
      ...data,
      intentId: intent.id,
      targetType: intent.targetType,
      targetNumber: intent.targetNumber,
    },
  });
}

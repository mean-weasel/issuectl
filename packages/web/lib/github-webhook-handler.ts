/* eslint-disable max-lines */
import type { IncomingMessage, ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import {
  countActiveWebhookIntents,
  getWebhookEventByDelivery,
  getRepoWebhookConfigById,
  getSetting,
  hasActiveWebhookIntent,
  mergeWebhookIntent,
  recordWebhookEvent,
} from "@issuectl/core";
import type { WebhookTargetType } from "@issuectl/core";
import {
  handleIssuectlCommentCommand,
  type GithubWebhookCommentCommandDeps,
} from "./github-webhook-comment-command";
import {
  asObject,
  getBoundedHeader,
  getNumberProperty,
  getRepositoryFullName,
  getSenderLogin,
  getSingleHeader,
  getStringProperty,
  isHookBindingValid,
  parseJson,
  readRawBody,
  recordWebhookDiagnostic,
  verifySignature,
  writeJson,
} from "./github-webhook-utils";
import { broadcastWebhookEventsChanged } from "./webhook-events-stream";

export const GITHUB_WEBHOOK_PATH_RE = /^\/api\/webhook\/github\/(\d+)$/;
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

const MAX_DELIVERY_ID_LENGTH = 128;
const MAX_EVENT_TYPE_LENGTH = 100;
const DEFAULT_RAW_PAYLOAD_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISSUE_AUTO_LAUNCH_LABEL = "issuectl:auto-launch";
const PR_AUTO_REVIEW_LABEL = "issuectl:auto-review";
const GATING_RELEVANT_EVENTS = new Set([
  "issues:opened",
  "issues:labeled",
  "issues:unlabeled",
  "issues:closed",
  "issues:reopened",
  "pull_request:opened",
  "pull_request:labeled",
  "pull_request:unlabeled",
  "pull_request:synchronize",
  "pull_request:closed",
]);
export type GithubWebhookHandlerDeps = GithubWebhookCommentCommandDeps;

export function isGithubWebhookRequest(url: string | undefined): boolean {
  return GITHUB_WEBHOOK_PATH_RE.test(
    new URL(url ?? "/", "http://localhost").pathname,
  );
}

export async function handleGithubWebhookRequest(
  db: Database.Database,
  req: IncomingMessage,
  res: ServerResponse,
  deps: GithubWebhookHandlerDeps = {},
): Promise<boolean> {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  const match = GITHUB_WEBHOOK_PATH_RE.exec(path);
  if (!match) return false;

  if (req.method !== "POST") {
    writeJson(res, 405, { ok: false, error: "Method not allowed" });
    return true;
  }

  const body = await readRawBody(req, MAX_WEBHOOK_BODY_BYTES);
  if (body.tooLarge) {
    writeJson(res, 413, { ok: false, error: "Payload too large" });
    return true;
  }

  const repoId = Number(match[1]);
  const repo = getRepoWebhookConfigById(db, repoId);
  if (!repo) {
    writeJson(res, 404, { ok: false, error: "Repository not found" });
    return true;
  }
  if (!repo.webhookSecret) {
    writeJson(res, 401, { ok: false, error: "Unauthorized" });
    return true;
  }

  const signature = getSingleHeader(req, "x-hub-signature-256");
  if (
    !signature ||
    !verifySignature(body.buffer, repo.webhookSecret, signature)
  ) {
    recordWebhookDiagnostic(db, repo, {
      event: "webhook.invalid_signature",
      deliveryId: getBoundedHeader(req, "x-github-delivery", MAX_DELIVERY_ID_LENGTH) ?? "unknown",
      eventType: getBoundedHeader(req, "x-github-event", MAX_EVENT_TYPE_LENGTH) ?? "unknown",
      action: null,
      targetType: null,
      targetNumber: null,
    });
    writeJson(res, 401, { ok: false, error: "Unauthorized" });
    return true;
  }

  const deliveryId = getBoundedHeader(
    req,
    "x-github-delivery",
    MAX_DELIVERY_ID_LENGTH,
  );
  if (!deliveryId) {
    writeJson(res, 400, { ok: false, error: "Invalid delivery id" });
    return true;
  }

  const eventType = getBoundedHeader(
    req,
    "x-github-event",
    MAX_EVENT_TYPE_LENGTH,
  );
  if (!eventType) {
    writeJson(res, 400, { ok: false, error: "Invalid event type" });
    return true;
  }

  const payload = parseJson(body.buffer);
  if (!payload) {
    writeJson(res, 400, { ok: false, error: "Invalid JSON" });
    return true;
  }

  if (getRepositoryFullName(payload) !== `${repo.owner}/${repo.name}`) {
    writeJson(res, 401, { ok: false, error: "Repository mismatch" });
    return true;
  }
  if (!isHookBindingValid(payload, repo.webhookId)) {
    writeJson(res, 401, { ok: false, error: "Hook mismatch" });
    return true;
  }

  const receivedAt = Date.now();
  const action = getStringProperty(payload, "action");
  const { targetType, targetNumber, desiredHeadSha } =
    classifyWebhookTarget(payload);
  const recorded = recordWebhookEvent(db, {
    deliveryId,
    repoId,
    eventType,
    action,
    senderLogin: getSenderLogin(payload),
    targetType,
    targetNumber,
    payloadJson:
      repo.webhookPayloadMode === "raw" ? body.buffer.toString("utf8") : null,
    receivedAt,
    retainedUntil:
      repo.webhookPayloadMode === "raw"
        ? receivedAt + getRawPayloadRetentionMs(db)
        : null,
  });

  if (recorded.deduped) {
    recordWebhookDiagnostic(db, repo, {
      event: "webhook.deduped",
      deliveryId,
      eventType,
      action,
      targetType,
      targetNumber,
    });
    const intentId = repairDedupedWebhookIntent(db, {
      deliveryId,
      repoId,
      eventType,
      action,
      targetType,
      targetNumber,
      desiredHeadSha,
      payload,
    });
    if (intentId !== null) {
      broadcastWebhookEventsChanged();
      writeJson(res, 200, { ok: true, deduped: true, intentId });
      return true;
    }

    writeJson(res, 200, { ok: true, deduped: true });
    return true;
  }

  let intentId: number | null = null;
  recordWebhookDiagnostic(db, repo, {
    event: "webhook.received",
    deliveryId,
    eventType,
    action,
    targetType,
    targetNumber,
    eventId: recorded.eventId,
  });
  broadcastWebhookEventsChanged();

  if (await handleIssuectlCommentCommand(db, repo, payload, res, {
    deliveryId,
    eventType,
    action,
    targetType,
    targetNumber,
    eventId: recorded.eventId,
  }, deps)) {
    return true;
  }
  if (
    targetType &&
    targetNumber !== null &&
    action &&
    isGatingRelevantEvent(eventType, action, payload)
  ) {
    const { debounceMs, maxDebounceMs } = getWebhookDebounceSettings(db);
    if (isQueueDepthExceeded(db, { repoId, targetType, targetNumber })) {
      recordWebhookDiagnostic(db, repo, {
        event: "webhook.runaway_limited",
        deliveryId,
        eventType,
        action,
        targetType,
        targetNumber,
        eventId: recorded.eventId,
      });
      broadcastWebhookEventsChanged();
      writeJson(res, 200, { ok: true, eventId: recorded.eventId, intentId: null });
      return true;
    }
    intentId = mergeWebhookIntent(db, {
      repoId,
      targetType,
      targetNumber,
      signalAt: receivedAt,
      scheduledAt: receivedAt + debounceMs,
      maxDebounceMs,
      desiredHeadSha,
      eventId: recorded.eventId,
    });
    recordWebhookDiagnostic(db, repo, {
      event: "webhook.debouncing",
      deliveryId,
      eventType,
      action,
      targetType,
      targetNumber,
      eventId: recorded.eventId,
      intentId,
    });
    broadcastWebhookEventsChanged();
  }

  writeJson(res, 200, { ok: true, eventId: recorded.eventId, intentId });
  return true;
}

function repairDedupedWebhookIntent(
  db: Database.Database,
  input: {
    deliveryId: string;
    repoId: number;
    eventType: string;
    action: string | null;
    targetType: WebhookTargetType | null;
    targetNumber: number | null;
    desiredHeadSha: string | null;
    payload: unknown;
  },
): number | null {
  const event = getWebhookEventByDelivery(db, {
    deliveryId: input.deliveryId,
    repoId: input.repoId,
  });
  if (!event || event.intentId !== null) return null;
  if (
    !event.targetType ||
    event.targetNumber === null ||
    !event.action ||
    input.eventType !== event.eventType ||
    input.action !== event.action ||
    input.targetType !== event.targetType ||
    input.targetNumber !== event.targetNumber ||
    !isGatingRelevantEvent(event.eventType, event.action, input.payload)
  ) {
    return null;
  }

  const { debounceMs, maxDebounceMs } = getWebhookDebounceSettings(db);
  return mergeWebhookIntent(db, {
    repoId: event.repoId,
    targetType: event.targetType,
    targetNumber: event.targetNumber,
    signalAt: event.receivedAt,
    scheduledAt: event.receivedAt + debounceMs,
    maxDebounceMs,
    desiredHeadSha: input.desiredHeadSha,
    eventId: event.id,
  });
}

function getWebhookDebounceSettings(db: Database.Database): { debounceMs: number; maxDebounceMs: number } {
  const debounceSeconds = Number(
    getSetting(db, "webhook_debounce_seconds") ?? "60",
  );
  const maxDebounceSeconds = Number(
    getSetting(db, "webhook_max_debounce_seconds") ?? "300",
  );
  const debounceMs = Number.isFinite(debounceSeconds)
    ? Math.max(0, debounceSeconds) * 1000
    : 60_000;
  const maxDebounceMs = Number.isFinite(maxDebounceSeconds)
    ? Math.max(0, maxDebounceSeconds) * 1000
    : 300_000;
  return { debounceMs, maxDebounceMs };
}

function getRawPayloadRetentionMs(db: Database.Database): number {
  return getRetentionDaysSetting(
    db,
    "webhook_raw_payload_retention_days",
    DEFAULT_RAW_PAYLOAD_RETENTION_DAYS,
  ) * DAY_MS;
}

function getRetentionDaysSetting(
  db: Database.Database,
  key: string,
  fallbackDays: number,
): number {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  const parsed = Number(row?.value ?? String(fallbackDays));
  if (!Number.isFinite(parsed) || parsed < 0) return fallbackDays;
  return parsed;
}

function isQueueDepthExceeded(
  db: Database.Database,
  target: { repoId: number; targetType: WebhookTargetType; targetNumber: number },
): boolean {
  if (hasActiveWebhookIntent(db, target)) return false;
  const maxQueueDepth = Number(getSetting(db, "max_webhook_queue_depth") ?? "100");
  const boundedMax = Number.isFinite(maxQueueDepth) ? Math.max(0, Math.floor(maxQueueDepth)) : 100;
  return countActiveWebhookIntents(db) >= boundedMax;
}

function isGatingRelevantEvent(eventType: string, action: string, payload: unknown): boolean {
  if (!GATING_RELEVANT_EVENTS.has(`${eventType}:${action}`)) return false;
  if (action !== "unlabeled") return true;
  const label = getWebhookLabelName(payload);
  if (eventType === "issues") return label === ISSUE_AUTO_LAUNCH_LABEL;
  if (eventType === "pull_request") return label === PR_AUTO_REVIEW_LABEL;
  return true;
}

function getWebhookLabelName(payload: unknown): string | null {
  return getStringProperty(asObject(asObject(payload)?.label), "name");
}

export function classifyWebhookTarget(payload: unknown): {
  targetType: WebhookTargetType | null;
  targetNumber: number | null;
  desiredHeadSha: string | null;
} {
  const object = asObject(payload);
  if (!object) return nullTarget();

  const issue = asObject(object.issue);
  if (issue) {
    const number = getNumberProperty(issue, "number");
    if (number === null) return nullTarget();
    return {
      targetType: asObject(issue.pull_request) ? "pr" : "issue",
      targetNumber: number,
      desiredHeadSha: null,
    };
  }

  const pullRequest = asObject(object.pull_request);
  if (pullRequest) {
    const number = getNumberProperty(pullRequest, "number");
    if (number === null) return nullTarget();
    return {
      targetType: "pr",
      targetNumber: number,
      desiredHeadSha: getStringProperty(asObject(pullRequest.head), "sha"),
    };
  }

  return nullTarget();
}

function nullTarget(): {
  targetType: null;
  targetNumber: null;
  desiredHeadSha: null;
} {
  return { targetType: null, targetNumber: null, desiredHeadSha: null };
}

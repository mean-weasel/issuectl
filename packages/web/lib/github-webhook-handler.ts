import type { IncomingMessage, ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import {
  getWebhookEventByDelivery,
  getRepoWebhookConfigById,
  getSetting,
  mergeWebhookIntent,
  recordWebhookEvent,
} from "@issuectl/core";
import type { WebhookTargetType } from "@issuectl/core";
import {
  asObject,
  getBoundedHeader,
  getNumberProperty,
  getRepositoryFullName,
  getSenderLogin,
  getSingleHeader,
  getStringProperty,
  parseJson,
  readRawBody,
  verifySignature,
  writeJson,
} from "./github-webhook-utils.js";

export const GITHUB_WEBHOOK_PATH_RE = /^\/api\/webhook\/github\/(\d+)$/;
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

const MAX_DELIVERY_ID_LENGTH = 128;
const MAX_EVENT_TYPE_LENGTH = 100;
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

export function isGithubWebhookRequest(url: string | undefined): boolean {
  return GITHUB_WEBHOOK_PATH_RE.test(
    new URL(url ?? "/", "http://localhost").pathname,
  );
}

export async function handleGithubWebhookRequest(
  db: Database.Database,
  req: IncomingMessage,
  res: ServerResponse,
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
  if (!repo?.webhookSecret) {
    writeJson(res, 401, { ok: false, error: "Unauthorized" });
    return true;
  }

  const signature = getSingleHeader(req, "x-hub-signature-256");
  if (
    !signature ||
    !verifySignature(body.buffer, repo.webhookSecret, signature)
  ) {
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
  });

  if (recorded.deduped) {
    const intentId = repairDedupedWebhookIntent(db, {
      deliveryId,
      repoId,
      eventType,
      action,
      targetType,
      targetNumber,
      desiredHeadSha,
    });
    if (intentId !== null) {
      writeJson(res, 200, { ok: true, deduped: true, intentId });
      return true;
    }

    writeJson(res, 200, { ok: true, deduped: true });
    return true;
  }

  let intentId: number | null = null;
  if (
    targetType &&
    targetNumber !== null &&
    action &&
    GATING_RELEVANT_EVENTS.has(`${eventType}:${action}`)
  ) {
    const debounceMs = getWebhookDebounceMs(db);
    intentId = mergeWebhookIntent(db, {
      repoId,
      targetType,
      targetNumber,
      signalAt: receivedAt,
      scheduledAt: receivedAt + debounceMs,
      desiredHeadSha,
      eventId: recorded.eventId,
    });
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
    !GATING_RELEVANT_EVENTS.has(`${event.eventType}:${event.action}`)
  ) {
    return null;
  }

  const debounceMs = getWebhookDebounceMs(db);
  return mergeWebhookIntent(db, {
    repoId: event.repoId,
    targetType: event.targetType,
    targetNumber: event.targetNumber,
    signalAt: event.receivedAt,
    scheduledAt: event.receivedAt + debounceMs,
    desiredHeadSha:
      input.eventType === event.eventType &&
      input.action === event.action &&
      input.targetType === event.targetType &&
      input.targetNumber === event.targetNumber
        ? input.desiredHeadSha
        : null,
    eventId: event.id,
  });
}

function getWebhookDebounceMs(db: Database.Database): number {
  const debounceSeconds = Number(
    getSetting(db, "webhook_debounce_seconds") ?? "60",
  );
  return Number.isFinite(debounceSeconds)
    ? Math.max(0, debounceSeconds) * 1000
    : 60_000;
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

import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type Database from "better-sqlite3";
import {
  getRepoWebhookConfigById,
  getSetting,
  mergeWebhookIntent,
  recordWebhookEvent,
} from "@issuectl/core";
import type { WebhookTargetType } from "@issuectl/core";

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

type JsonObject = Record<string, unknown>;

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
    const debounceSeconds = Number(
      getSetting(db, "webhook_debounce_seconds") ?? "60",
    );
    const debounceMs = Number.isFinite(debounceSeconds)
      ? Math.max(0, debounceSeconds) * 1000
      : 60_000;
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

async function readRawBody(
  req: IncomingMessage,
  limitBytes: number,
): Promise<{ buffer: Buffer; tooLarge: boolean }> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limitBytes) {
      return { buffer: Buffer.alloc(0), tooLarge: true };
    }
    chunks.push(buffer);
  }

  return { buffer: Buffer.concat(chunks), tooLarge: false };
}

function verifySignature(
  body: Buffer,
  secret: string,
  signature: string,
): boolean {
  const prefix = "sha256=";
  if (!signature.startsWith(prefix)) return false;

  const expected = createHmac("sha256", secret).update(body).digest();
  const actualHex = signature.slice(prefix.length);
  if (!/^[a-fA-F0-9]{64}$/.test(actualHex)) return false;

  const actual = Buffer.from(actualHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function writeJson(
  res: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function getSingleHeader(
  req: IncomingMessage,
  name: string,
): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

function getBoundedHeader(
  req: IncomingMessage,
  name: string,
  maxLength: number,
): string | null {
  const value = getSingleHeader(req, name);
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

function parseJson(body: Buffer): JsonObject | null {
  try {
    return asObject(JSON.parse(body.toString("utf8")));
  } catch {
    return null;
  }
}

function getRepositoryFullName(payload: JsonObject): string | null {
  return getStringProperty(asObject(payload.repository), "full_name");
}

function getSenderLogin(payload: JsonObject): string | null {
  return getStringProperty(asObject(payload.sender), "login");
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

function getStringProperty(
  object: JsonObject | null,
  key: string,
): string | null {
  const value = object?.[key];
  return typeof value === "string" ? value : null;
}

function getNumberProperty(object: JsonObject, key: string): number | null {
  const value = object[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function nullTarget(): {
  targetType: null;
  targetNumber: null;
  desiredHeadSha: null;
} {
  return { targetType: null, targetNumber: null, desiredHeadSha: null };
}

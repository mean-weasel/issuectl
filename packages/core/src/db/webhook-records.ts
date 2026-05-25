import type { WebhookIntentStatus, WebhookTargetType } from "../types.js";

export const ACTIVE_INTENT_STATUSES: WebhookIntentStatus[] = [
  "pending",
  "processing",
  "deferred",
];

export type RecordWebhookEventInput = {
  deliveryId: string;
  repoId: number;
  eventType: string;
  action?: string | null;
  senderLogin?: string | null;
  targetType?: WebhookTargetType | null;
  targetNumber?: number | null;
  payloadJson?: string | null;
  receivedAt: number;
  retainedUntil?: number | null;
};

export type RecordWebhookEventResult =
  | { deduped: true; eventId?: undefined }
  | { deduped: false; eventId: number };

export type MergeWebhookIntentInput = {
  repoId: number;
  targetType: WebhookTargetType;
  targetNumber: number;
  signalAt: number;
  scheduledAt: number;
  maxDebounceMs?: number | null;
  desiredHeadSha?: string | null;
  requestedAgent?: "claude" | "codex" | null;
  reviewMode?: "auto" | "full" | null;
  eventId?: number | null;
};

export type WebhookEvent = {
  id: number;
  deliveryId: string;
  repoId: number;
  eventType: string;
  action: string | null;
  senderLogin: string | null;
  targetType: WebhookTargetType | null;
  targetNumber: number | null;
  payloadJson: string | null;
  receivedAt: number;
  intentId: number | null;
};

export type WebhookIntent = {
  id: number;
  repoId: number;
  targetType: WebhookTargetType;
  targetNumber: number;
  firstSignalAt: number;
  lastSignalAt: number;
  scheduledAt: number;
  processingStartedAt: number | null;
  leaseExpiresAt: number | null;
  generation: number;
  desiredHeadSha: string | null;
  requestedAgent: "claude" | "codex" | null;
  reviewMode: "auto" | "full" | null;
  signalCount: number;
  status: WebhookIntentStatus;
  resolvedAt: number | null;
  deploymentId: number | null;
  failureReason: string | null;
};

export type WebhookLogResult =
  | "fired"
  | "debouncing"
  | "processing"
  | "gated"
  | "dropped"
  | "failed"
  | "received";

export type WebhookLogEntry = WebhookEvent & {
  intent: WebhookIntent | null;
  result: WebhookLogResult;
  resultDetail: string | null;
  actionId: string | null;
};

export type WebhookEventRow = {
  id: number;
  delivery_id: string;
  repo_id: number;
  event_type: string;
  action: string | null;
  sender_login: string | null;
  target_type: WebhookTargetType | null;
  target_number: number | null;
  payload_json: string | null;
  received_at: number;
  intent_id: number | null;
};

export type ListWebhookEventsInput = {
  limit?: number;
  repoId?: number;
  targetType?: WebhookTargetType;
  targetNumber?: number;
};

export type ListWebhookIntentsInput = {
  limit?: number;
  repoId?: number;
  targetType?: WebhookTargetType;
  targetNumber?: number;
  status?: WebhookIntentStatus | "active" | "terminal";
};

export type WebhookIntentRow = {
  id: number;
  repo_id: number;
  target_type: WebhookTargetType;
  target_number: number;
  first_signal_at: number;
  last_signal_at: number;
  scheduled_at: number;
  processing_started_at: number | null;
  lease_expires_at: number | null;
  generation: number;
  desired_head_sha: string | null;
  requested_agent: "claude" | "codex" | null;
  review_mode: "auto" | "full" | null;
  signal_count: number;
  status: WebhookIntentStatus;
  resolved_at: number | null;
  deployment_id: number | null;
  failure_reason: string | null;
};

export type WebhookLogEntryRow = WebhookEventRow & {
  intent_id_joined: number | null;
  intent_repo_id: number | null;
  intent_target_type: WebhookTargetType | null;
  intent_target_number: number | null;
  first_signal_at: number | null;
  last_signal_at: number | null;
  scheduled_at: number | null;
  processing_started_at: number | null;
  lease_expires_at: number | null;
  generation: number | null;
  desired_head_sha: string | null;
  requested_agent: "claude" | "codex" | null;
  review_mode: "auto" | "full" | null;
  signal_count: number | null;
  intent_status: WebhookIntentStatus | null;
  resolved_at: number | null;
  deployment_id: number | null;
  failure_reason: string | null;
};

export function rowToWebhookEvent(row: WebhookEventRow): WebhookEvent {
  return {
    id: row.id,
    deliveryId: row.delivery_id,
    repoId: row.repo_id,
    eventType: row.event_type,
    action: row.action,
    senderLogin: row.sender_login,
    targetType: row.target_type,
    targetNumber: row.target_number,
    payloadJson: row.payload_json,
    receivedAt: row.received_at,
    intentId: row.intent_id,
  };
}

export function rowToWebhookIntent(row: WebhookIntentRow): WebhookIntent {
  return {
    id: row.id,
    repoId: row.repo_id,
    targetType: row.target_type,
    targetNumber: row.target_number,
    firstSignalAt: row.first_signal_at,
    lastSignalAt: row.last_signal_at,
    scheduledAt: row.scheduled_at,
    processingStartedAt: row.processing_started_at,
    leaseExpiresAt: row.lease_expires_at,
    generation: row.generation,
    desiredHeadSha: row.desired_head_sha,
    requestedAgent: row.requested_agent,
    reviewMode: row.review_mode,
    signalCount: row.signal_count,
    status: row.status,
    resolvedAt: row.resolved_at,
    deploymentId: row.deployment_id,
    failureReason: row.failure_reason,
  };
}

export function rowToWebhookLogEntry(row: WebhookLogEntryRow): WebhookLogEntry {
  const event = rowToWebhookEvent(row);
  const intent = row.intent_id_joined === null
    ? null
    : rowToWebhookIntent({
      id: row.intent_id_joined,
      repo_id: row.intent_repo_id ?? row.repo_id,
      target_type: row.intent_target_type ?? (row.target_type ?? "issue"),
      target_number: row.intent_target_number ?? (row.target_number ?? 0),
      first_signal_at: row.first_signal_at ?? row.received_at,
      last_signal_at: row.last_signal_at ?? row.received_at,
      scheduled_at: row.scheduled_at ?? row.received_at,
      processing_started_at: row.processing_started_at,
      lease_expires_at: row.lease_expires_at,
      generation: row.generation ?? 1,
      desired_head_sha: row.desired_head_sha,
      requested_agent: row.requested_agent,
      review_mode: row.review_mode,
      signal_count: row.signal_count ?? 1,
      status: row.intent_status ?? "pending",
      resolved_at: row.resolved_at,
      deployment_id: row.deployment_id,
      failure_reason: row.failure_reason,
    });
  const result = resultForIntent(intent);
  return {
    ...event,
    intent,
    result,
    resultDetail: resultDetailForIntent(intent, result),
    actionId: intent?.deploymentId ? `dep_${intent.deploymentId}` : null,
  };
}

function resultForIntent(intent: WebhookIntent | null): WebhookLogResult {
  if (!intent) return "received";
  if (intent.status === "launched") return "fired";
  if (intent.status === "pending" || intent.status === "deferred") return "debouncing";
  if (intent.status === "processing") return "processing";
  if (intent.status === "failed") return "failed";
  if (intent.status === "skipped_locked" || intent.status === "skipped_optout") return "gated";
  if (intent.status === "expired") return "dropped";
  return "received";
}

function resultDetailForIntent(
  intent: WebhookIntent | null,
  result: WebhookLogResult,
): string | null {
  if (!intent) return null;
  if (intent.failureReason) return intent.failureReason;
  if (intent.deploymentId) return `deployment ${intent.deploymentId}`;
  if (result === "debouncing") return `scheduled ${intent.scheduledAt}`;
  return intent.status;
}

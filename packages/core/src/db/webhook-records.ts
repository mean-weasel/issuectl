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

import type Database from "better-sqlite3";

export type IntentEventSummary = {
  eventType: string;
  action: string | null;
} | null;

export function getLatestIntentEvent(
  db: Database.Database,
  intentId: number,
): IntentEventSummary {
  const row = db.prepare(
    `SELECT event_type, action
     FROM webhook_events
     WHERE intent_id = ?
     ORDER BY received_at DESC, id DESC
     LIMIT 1`,
  ).get(intentId) as { event_type: string; action: string | null } | undefined;
  return row ? { eventType: row.event_type, action: row.action } : null;
}

export function triggeredByForIntentEvent(
  event: IntentEventSummary,
): "webhook" | "comment_command" {
  return isCommentCommandEvent(event) ? "comment_command" : "webhook";
}

export function isCommentCommandEvent(event: IntentEventSummary): boolean {
  return event?.action === "created" && (
    event.eventType === "issue_comment" ||
    event.eventType === "pull_request_review_comment"
  );
}

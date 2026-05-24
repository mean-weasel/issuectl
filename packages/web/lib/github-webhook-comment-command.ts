import type Database from "better-sqlite3";
import {
  killTmuxSession,
  killTtyd,
  markActivePrReviewForDeploymentTerminal,
  mergeWebhookIntent,
  tmuxSessionName,
  withAuthRetry,
} from "@issuectl/core";
import type { Repo, WebhookTargetType } from "@issuectl/core";
import { parseIssuectlCommentCommand } from "./issuectl-comment-command";
import {
  asObject,
  getNumberProperty,
  recordWebhookDiagnostic,
  writeJson,
  type JsonObject,
} from "./github-webhook-utils";
import type { ServerResponse } from "node:http";

const COMMAND_PERMISSIONS = new Set(["admin", "maintain", "write"]);
const COMMAND_RATE_LIMIT_WINDOW_MS = 60_000;
const COMMAND_ACTOR_RATE_LIMIT = 5;
const COMMAND_TARGET_RATE_LIMIT = 10;

export type GithubWebhookCommentCommandDeps = {
  getCollaboratorPermission?: (
    owner: string,
    repo: string,
    username: string,
  ) => Promise<string>;
  createIssueCommentReaction?: (
    owner: string,
    repo: string,
    commentId: number,
    content: "+1" | "-1" | "eyes",
  ) => Promise<void>;
  killTmuxSession?: typeof killTmuxSession;
  killTtyd?: typeof killTtyd;
  tmuxSessionName?: typeof tmuxSessionName;
};

export async function handleIssuectlCommentCommand(
  db: Database.Database,
  repo: Repo,
  payload: JsonObject,
  res: ServerResponse,
  input: {
    deliveryId: string;
    eventType: string;
    action: string | null;
    targetType: WebhookTargetType | null;
    targetNumber: number | null;
    eventId: number;
  },
  deps: GithubWebhookCommentCommandDeps = {},
): Promise<boolean> {
  const commentCommand = parseIssuectlCommentCommand(input.eventType, payload);
  if (commentCommand.kind === "ignored") return false;
  if (commentCommand.kind === "denied") {
    recordCommandDiagnostic(db, repo, input, "webhook.comment_command_denied");
    await emitCommandReaction(repo, payload, "-1", deps);
    writeJson(res, 200, { ok: true, eventId: input.eventId, intentId: null });
    return true;
  }

  const diagnosticInput = {
    ...input,
    targetType: commentCommand.targetType,
    targetNumber: commentCommand.targetNumber,
  };
  if (isRateLimited(db, repo.id, input.eventId, commentCommand)) {
    recordCommandDiagnostic(db, repo, diagnosticInput, "webhook.comment_command_rate_limited");
    await emitCommandReaction(repo, payload, "eyes", deps);
    writeJson(res, 200, { ok: true, eventId: input.eventId, intentId: null });
    return true;
  }

  const permission = await (deps.getCollaboratorPermission ?? getCollaboratorPermission)(
    repo.owner,
    repo.name,
    commentCommand.actor,
  );
  const accepted = COMMAND_PERMISSIONS.has(permission);
  recordCommandDiagnostic(db, repo, diagnosticInput, accepted
    ? "webhook.comment_command_accepted"
    : "webhook.comment_command_denied");
  if (!accepted) {
    await emitCommandReaction(repo, payload, "-1", deps);
    writeJson(res, 200, { ok: true, eventId: input.eventId, intentId: null });
    return true;
  }

  if (commentCommand.action === "end") {
    const endedSessions = endNonManualTargetSessions(
      db,
      repo,
      commentCommand.targetType,
      commentCommand.targetNumber,
      deps,
    );
    await emitCommandReaction(repo, payload, "+1", deps);
    writeJson(res, 200, { ok: true, eventId: input.eventId, intentId: null, endedSessions });
    return true;
  }

  const intentId = mergeWebhookIntent(db, {
      repoId: repo.id,
      targetType: commentCommand.targetType,
      targetNumber: commentCommand.targetNumber,
      signalAt: Date.now(),
      scheduledAt: Date.now(),
      eventId: input.eventId,
      requestedAgent: commentCommand.agent,
      reviewMode: commentCommand.action === "review" && commentCommand.full ? "full" : null,
    });
  await emitCommandReaction(repo, payload, "+1", deps);
  writeJson(res, 200, { ok: true, eventId: input.eventId, intentId });
  return true;
}

async function emitCommandReaction(
  repo: Repo,
  payload: JsonObject,
  content: "+1" | "-1" | "eyes",
  deps: GithubWebhookCommentCommandDeps,
): Promise<void> {
  const comment = asObject(payload.comment);
  const commentId = comment ? getNumberProperty(comment, "id") : null;
  if (!commentId) return;
  try {
    await (deps.createIssueCommentReaction ?? createIssueCommentReaction)(
      repo.owner,
      repo.name,
      commentId,
      content,
    );
  } catch {
    // Feedback reactions must never make webhook delivery retry or fail.
  }
}

function isRateLimited(
  db: Database.Database,
  repoId: number,
  eventId: number,
  command: {
    actor: string;
    targetType: WebhookTargetType;
    targetNumber: number;
  },
): boolean {
  const receivedAt = getEventReceivedAt(db, eventId) ?? Date.now();
  const since = receivedAt - COMMAND_RATE_LIMIT_WINDOW_MS;
  const actorCount = countRecentCommentEvents(db, {
    repoId,
    senderLogin: command.actor,
    since,
    until: receivedAt,
  });
  if (actorCount > COMMAND_ACTOR_RATE_LIMIT) return true;
  const targetCount = countRecentCommentEvents(db, {
    repoId,
    targetType: command.targetType,
    targetNumber: command.targetNumber,
    since,
    until: receivedAt,
  });
  return targetCount > COMMAND_TARGET_RATE_LIMIT;
}

function getEventReceivedAt(db: Database.Database, eventId: number): number | null {
  const row = db.prepare(
    "SELECT received_at FROM webhook_events WHERE id = ?",
  ).get(eventId) as { received_at: number } | undefined;
  return row?.received_at ?? null;
}

function countRecentCommentEvents(
  db: Database.Database,
  input: {
    repoId: number;
    senderLogin?: string;
    targetType?: WebhookTargetType;
    targetNumber?: number;
    since: number;
    until: number;
  },
): number {
  const where = [
    "repo_id = ?",
    "event_type IN ('issue_comment', 'pull_request_review_comment')",
    "received_at >= ?",
    "received_at <= ?",
  ];
  const params: unknown[] = [input.repoId, input.since, input.until];
  if (input.senderLogin) {
    where.push("sender_login = ?");
    params.push(input.senderLogin);
  }
  if (input.targetType && input.targetNumber !== undefined) {
    where.push("target_type = ?", "target_number = ?");
    params.push(input.targetType, input.targetNumber);
  }
  const row = db.prepare(
    `SELECT COUNT(*) AS count FROM webhook_events WHERE ${where.join(" AND ")}`,
  ).get(...params) as { count: number };
  return row.count;
}

function endNonManualTargetSessions(
  db: Database.Database,
  repo: Repo,
  targetType: WebhookTargetType,
  targetNumber: number,
  deps: GithubWebhookCommentCommandDeps,
): number {
  const columns = db.prepare("PRAGMA table_info(deployments)").all() as Array<{ name: string }>;
  const hasTargets = columns.some((column) => column.name === "target_type")
    && columns.some((column) => column.name === "target_number");
  const hasTerminalReason = columns.some((column) => column.name === "terminal_reason");
  const hasTtydPid = columns.some((column) => column.name === "ttyd_pid");
  const hasTerminalBackend = columns.some((column) => column.name === "terminal_backend");
  const where = hasTargets
    ? "repo_id = ? AND target_type = ? AND target_number = ?"
    : "repo_id = ? AND issue_number = ?";
  const params = hasTargets ? [repo.id, targetType, targetNumber] : [repo.id, targetNumber];
  const ttydPidSelect = hasTtydPid ? "ttyd_pid" : "NULL AS ttyd_pid";
  const backendSelect = hasTerminalBackend ? "terminal_backend" : "'ttyd' AS terminal_backend";
  const sessions = db.prepare(
    `SELECT id, ${ttydPidSelect}, ${backendSelect}
     FROM deployments
     WHERE ${where}
       AND ended_at IS NULL
       AND triggered_by IN ('webhook', 'comment_command')`,
  ).all(...params) as Array<{ id: number; ttyd_pid: number | null; terminal_backend: string }>;
  const terminalReasonSet = hasTerminalReason
    ? ", terminal_reason = COALESCE(terminal_reason, 'ended_manual')"
    : "";
  const end = db.prepare(
    `UPDATE deployments
     SET ended_at = COALESCE(ended_at, datetime('now'))${terminalReasonSet}
     WHERE id = ? AND ended_at IS NULL`,
  );
  const sessionName = (deps.tmuxSessionName ?? tmuxSessionName)(repo.name, targetNumber, targetType);
  const endTtyd = deps.killTtyd ?? killTtyd;
  const endTmuxSession = deps.killTmuxSession ?? killTmuxSession;
  let ended = 0;
  for (const session of sessions) {
    if (session.ttyd_pid) endTtyd(session.ttyd_pid, sessionName);
    else if (session.terminal_backend === "pty_bridge") endTmuxSession(sessionName);
    ended += end.run(session.id).changes;
    if (targetType === "pr") {
      markActivePrReviewForDeploymentTerminal(db, session.id, {
        completedAt: Date.now(),
        status: "superseded",
        reason: "ended_manual",
      });
    }
  }
  return ended;
}

function recordCommandDiagnostic(
  db: Database.Database,
  repo: Repo,
  input: {
    deliveryId: string;
    eventType: string;
    action: string | null;
    targetType: WebhookTargetType | null;
    targetNumber: number | null;
    eventId: number;
  },
  event: string,
): void {
  recordWebhookDiagnostic(db, repo, { ...input, event });
}

function getCollaboratorPermission(
  owner: string,
  repo: string,
  username: string,
): Promise<string> {
  return withAuthRetry(async (octokit) => {
    const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username,
    });
    return data.permission;
  });
}

function createIssueCommentReaction(
  owner: string,
  repo: string,
  commentId: number,
  content: "+1" | "-1" | "eyes",
): Promise<void> {
  return withAuthRetry(async (octokit) => {
    await octokit.rest.reactions.createForIssueComment({
      owner,
      repo,
      comment_id: commentId,
      content,
    });
  });
}

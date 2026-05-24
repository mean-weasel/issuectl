import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  queryDiagnosticEvents,
  recordWebhookEvent,
  seedDefaults,
  updateRepoWebhookSettings,
} from "@issuectl/core";
import { handleGithubWebhookRequest } from "./github-webhook-handler.js";

const SECRET = "webhook-secret";

type MockResponse = ServerResponse & { body: string; headers: Record<string, string | number | readonly string[]> };

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedDefaults(db);
  return db;
}

function createSignedRequest(repoId: number, body: string): IncomingMessage {
  const req = Readable.from([Buffer.from(body)]) as IncomingMessage;
  req.method = "POST";
  req.url = `/api/webhook/github/${repoId}`;
  req.headers = {
    "x-github-event": "issue_comment",
    "x-github-delivery": "delivery-command",
    "x-hub-signature-256": `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`,
  };
  return req;
}

function createResponse(): MockResponse {
  const res = {
    statusCode: 200,
    body: "",
    headers: {} as Record<string, string | number | readonly string[]>,
    setHeader(name: string, value: string | number | readonly string[]) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) this.body += String(chunk);
      return this;
    },
  };
  return res as MockResponse;
}

function issueCommentPayload(
  body: string,
  issue: Record<string, unknown> = { number: 506 },
  comment: Record<string, unknown> = {},
) {
  return JSON.stringify({
    action: "created",
    repository: { full_name: "mean-weasel/issuectl" },
    sender: { login: "octocat", type: "User" },
    comment: { body, ...comment, user: { login: "octocat", type: "User" } },
    issue,
  });
}

describe("issuectl comment command webhooks", () => {
  let db: Database.Database;
  let repoId: number;

  beforeEach(() => {
    db = createTestDb();
    const repo = addRepo(db, { owner: "mean-weasel", name: "issuectl" });
    repoId = repo.id;
    updateRepoWebhookSettings(db, repoId, { webhookSecret: SECRET });
  });

  it("accepts authorized launch commands by creating issue intents", async () => {
    const res = createResponse();
    await handleGithubWebhookRequest(db, createSignedRequest(
      repoId,
      issueCommentPayload("/issuectl launch --agent codex"),
    ), res, { getCollaboratorPermission: async () => "write" });

    expect(JSON.parse(res.body)).toEqual({ ok: true, eventId: 1, intentId: 1 });
    expect(db.prepare(
      "SELECT target_type, target_number, status FROM webhook_intents",
    ).get()).toEqual({ target_type: "issue", target_number: 506, status: "pending" });
    expect(queryDiagnosticEvents(db, { events: ["webhook.comment_command_accepted"] })).toHaveLength(1);
  });

  it("emits bounded command feedback reactions through daemon deps", async () => {
    const reactions: Array<{ commentId: number; content: string }> = [];
    const res = createResponse();
    await handleGithubWebhookRequest(db, createSignedRequest(
      repoId,
      issueCommentPayload("/issuectl launch", { number: 506 }, { id: 99 }),
    ), res, {
      getCollaboratorPermission: async () => "write",
      createIssueCommentReaction: async (_owner, _repo, commentId, content) => {
        reactions.push({ commentId, content });
      },
    });

    expect(JSON.parse(res.body)).toEqual({ ok: true, eventId: 1, intentId: 1 });
    expect(reactions).toEqual([{ commentId: 99, content: "+1" }]);
  });

  it("accepts authorized review commands by creating PR intents", async () => {
    const res = createResponse();
    await handleGithubWebhookRequest(db, createSignedRequest(
      repoId,
      issueCommentPayload("/issuectl review --full", { number: 44, pull_request: {} }),
    ), res, { getCollaboratorPermission: async () => "write" });

    expect(JSON.parse(res.body)).toEqual({ ok: true, eventId: 1, intentId: 1 });
    expect(db.prepare(
      "SELECT target_type, target_number, status FROM webhook_intents",
    ).get()).toEqual({ target_type: "pr", target_number: 44, status: "pending" });
  });

  it("ends only non-manual target sessions for authorized end commands", async () => {
    const otherRepo = addRepo(db, { owner: "mean-weasel", name: "other" });
    db.prepare(
      `INSERT INTO deployments (repo_id, issue_number, target_type, target_number, branch_name, workspace_mode, workspace_path, triggered_by)
       VALUES (?, 506, 'issue', 506, 'manual', 'worktree', '/tmp/manual', 'manual')`,
    ).run(repoId);
    db.prepare(
      `INSERT INTO deployments (repo_id, issue_number, target_type, target_number, branch_name, workspace_mode, workspace_path, triggered_by)
       VALUES (?, 507, 'issue', 507, 'webhook', 'worktree', '/tmp/webhook', 'webhook')`,
    ).run(repoId);
    db.prepare(
      `INSERT INTO deployments (repo_id, issue_number, target_type, target_number, branch_name, workspace_mode, workspace_path, triggered_by)
       VALUES (?, 507, 'issue', 507, 'other-webhook', 'worktree', '/tmp/other-webhook', 'webhook')`,
    ).run(otherRepo.id);

    const res = createResponse();
    await handleGithubWebhookRequest(db, createSignedRequest(
      repoId,
      issueCommentPayload("/issuectl end", { number: 507 }),
    ), res, { getCollaboratorPermission: async () => "write" });

    expect(JSON.parse(res.body)).toEqual({ ok: true, eventId: 1, intentId: null, endedSessions: 1 });
    expect(db.prepare("SELECT ended_at FROM deployments WHERE issue_number = 506").get()).toEqual({ ended_at: null });
    expect(db.prepare("SELECT ended_at FROM deployments WHERE repo_id = ? AND issue_number = 507").get(repoId)).toEqual({ ended_at: expect.any(String) });
    expect(db.prepare("SELECT ended_at FROM deployments WHERE repo_id = ? AND issue_number = 507").get(otherRepo.id)).toEqual({ ended_at: null });
  });

  it("denies commands from read-only collaborators", async () => {
    const res = createResponse();
    await handleGithubWebhookRequest(db, createSignedRequest(
      repoId,
      issueCommentPayload("/issuectl launch"),
    ), res, { getCollaboratorPermission: async () => "read" });

    expect(JSON.parse(res.body)).toEqual({ ok: true, eventId: 1, intentId: null });
    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get()).toEqual({ count: 0 });
    expect(queryDiagnosticEvents(db, { events: ["webhook.comment_command_denied"] })).toHaveLength(1);
  });

  it("rate limits accepted commands without creating intents", async () => {
    for (let i = 0; i < 5; i += 1) {
      recordWebhookEvent(db, {
        deliveryId: `previous-command-${i}`,
        repoId,
        eventType: "issue_comment",
        action: "created",
        senderLogin: "octocat",
        targetType: "issue",
        targetNumber: 506,
        receivedAt: Date.now() - 1_000,
      });
    }

    const res = createResponse();
    let permissionCalls = 0;
    await handleGithubWebhookRequest(db, createSignedRequest(
      repoId,
      issueCommentPayload("/issuectl launch"),
    ), res, { getCollaboratorPermission: async () => {
      permissionCalls += 1;
      return "write";
    } });

    expect(JSON.parse(res.body)).toEqual({ ok: true, eventId: 6, intentId: null });
    expect(permissionCalls).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get()).toEqual({ count: 0 });
    expect(queryDiagnosticEvents(db, { events: ["webhook.comment_command_rate_limited"] })).toHaveLength(1);
  });
});

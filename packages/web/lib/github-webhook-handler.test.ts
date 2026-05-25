/* eslint-disable max-lines */
import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  listWebhookEvents,
  queryDiagnosticEvents,
  recordWebhookEvent,
  seedDefaults,
  setSetting,
  updateRepoWebhookSettings,
} from "@issuectl/core";
import type { Repo } from "@issuectl/core";
import { handleGithubWebhookRequest } from "./github-webhook-handler.js";

const SECRET = "webhook-secret";

type MockResponse = ServerResponse & {
  body: string;
  headers: Record<string, string | number | readonly string[]>;
};

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedDefaults(db);
  return db;
}

function createSignedRequest(input: {
  repoId: number;
  body?: string;
  deliveryId?: string;
  event?: string;
  method?: string;
  signature?: string | null;
}): IncomingMessage {
  const body = input.body ?? "{}";
  const signature =
    input.signature === undefined
      ? `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`
      : input.signature;
  const headers: Record<string, string> = {
    "x-github-event": input.event ?? "issues",
    "x-github-delivery": input.deliveryId ?? "delivery-1",
  };

  if (signature !== null) headers["x-hub-signature-256"] = signature;

  const req = Readable.from([Buffer.from(body)]) as IncomingMessage;
  req.method = input.method ?? "POST";
  req.url = `/api/webhook/github/${input.repoId}`;
  req.headers = headers;
  return req;
}

function createResponse(): MockResponse {
  const res = {
    statusCode: 200,
    body: "",
    headers: {} as Record<string, string | number | readonly string[]>,
    setHeader(name: string, value: string | number | readonly string[]) {
      this.headers[name.toLowerCase()] = Array.isArray(value)
        ? [...value]
        : value;
      return this;
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) this.body += String(chunk);
      return this;
    },
  };
  return res as MockResponse;
}

async function postWebhook(
  db: Database.Database,
  input: Parameters<typeof createSignedRequest>[0],
): Promise<MockResponse> {
  const res = createResponse();
  await handleGithubWebhookRequest(db, createSignedRequest(input), res);
  return res;
}

function jsonBody(res: MockResponse): unknown {
  return JSON.parse(res.body);
}

function issuesOpenedPayload(fullName = "mean-weasel/issuectl") {
  return {
    action: "opened",
    repository: { full_name: fullName },
    issue: { number: 506 },
    sender: { login: "octocat" },
  };
}

function setupRepo(db: Database.Database): Repo {
  const repo = addRepo(db, { owner: "mean-weasel", name: "issuectl" });
  updateRepoWebhookSettings(db, repo.id, { webhookSecret: SECRET });
  return repo;
}

describe("handleGithubWebhookRequest", () => {
  let db: Database.Database;
  let repo: Repo;

  beforeEach(() => {
    db = createTestDb();
    repo = setupRepo(db);
  });

  it("rejects non-POST requests with 405", async () => {
    const res = createResponse();

    const handled = await handleGithubWebhookRequest(
      db,
      createSignedRequest({ repoId: repo.id, method: "GET" }),
      res,
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(405);
    expect(jsonBody(res)).toEqual({ ok: false, error: "Method not allowed" });
  });

  it("rejects missing signatures with 401", async () => {
    const res = await postWebhook(db, { repoId: repo.id, signature: null });
    expect(res.statusCode).toBe(401);
    expect(jsonBody(res)).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("rejects invalid signatures with 401", async () => {
    const res = await postWebhook(db, {
      repoId: repo.id,
      signature: "sha256=bad",
    });
    expect(res.statusCode).toBe(401);
    expect(jsonBody(res)).toEqual({ ok: false, error: "Unauthorized" });
    expect(queryDiagnosticEvents(db, { events: ["webhook.invalid_signature"] })).toEqual([
      expect.objectContaining({
        owner: "mean-weasel",
        repo: "issuectl",
        correlationId: "delivery-1",
      }),
    ]);
  });

  it("rejects oversized bodies with 413", async () => {
    const res = await postWebhook(db, {
      repoId: repo.id,
      body: "x".repeat(1024 * 1024 + 1),
    });
    expect(res.statusCode).toBe(413);
    expect(jsonBody(res)).toEqual({ ok: false, error: "Payload too large" });
  });

  it("rejects payloads whose repository does not match the route repo", async () => {
    const body = JSON.stringify(issuesOpenedPayload("other/repo"));
    const res = await postWebhook(db, { repoId: repo.id, body });

    expect(res.statusCode).toBe(401);
    expect(jsonBody(res)).toEqual({ ok: false, error: "Repository mismatch" });
  });

  it("returns 404 for unknown webhook repos", async () => {
    const res = await postWebhook(db, {
      repoId: repo.id + 1,
      body: JSON.stringify(issuesOpenedPayload()),
    });
    expect(res.statusCode).toBe(404);
    expect(jsonBody(res)).toEqual({ ok: false, error: "Repository not found" });
  });

  it("rejects payload hook ids that do not match the configured webhook id", async () => {
    updateRepoWebhookSettings(db, repo.id, { webhookId: 123 });
    const body = JSON.stringify({
      ...issuesOpenedPayload(),
      hook: { id: 456 },
    });
    const res = await postWebhook(db, { repoId: repo.id, body });

    expect(res.statusCode).toBe(401);
    expect(jsonBody(res)).toEqual({ ok: false, error: "Hook mismatch" });
  });

  it("dedupes repeated delivery ids", async () => {
    const body = JSON.stringify(issuesOpenedPayload());
    const input = { repoId: repo.id, body, deliveryId: "delivery-1" };
    const first = await postWebhook(db, input);
    const second = await postWebhook(db, input);

    expect(first.statusCode).toBe(200);
    expect(jsonBody(second)).toEqual({ ok: true, deduped: true });
    expect(listWebhookEvents(db)).toHaveLength(1);
    expect(queryDiagnosticEvents(db, { events: ["webhook.deduped"] })).toEqual([
      expect.objectContaining({
        owner: "mean-weasel",
        repo: "issuectl",
        issueNumber: 506,
        correlationId: "delivery-1",
      }),
    ]);
  });

  it("repairs a deduped gating event that was recorded without an intent", async () => {
    const body = JSON.stringify(issuesOpenedPayload());
    recordWebhookEvent(db, {
      deliveryId: "delivery-repair",
      repoId: repo.id,
      eventType: "issues",
      action: "opened",
      senderLogin: "octocat",
      targetType: "issue",
      targetNumber: 506,
      receivedAt: 1_000,
    });
    const res = await postWebhook(db, {
      repoId: repo.id,
      body,
      deliveryId: "delivery-repair",
    });

    const responseBody = jsonBody(res) as {
      ok: boolean;
      deduped: boolean;
      intentId: number;
    };
    const event = listWebhookEvents(db)[0];

    expect(res.statusCode).toBe(200);
    expect(responseBody).toEqual({
      ok: true,
      deduped: true,
      intentId: 1,
    });
    expect(event?.intentId).toBe(responseBody.intentId);
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get(),
    ).toEqual({ count: 1 });
  });

  it("preserves dedupe semantics for non-gating events", async () => {
    const body = JSON.stringify({
      action: "edited",
      repository: { full_name: "mean-weasel/issuectl" },
      issue: { number: 506 },
      sender: { login: "octocat" },
    });
    recordWebhookEvent(db, {
      deliveryId: "delivery-non-gating",
      repoId: repo.id,
      eventType: "issues",
      action: "edited",
      senderLogin: "octocat",
      targetType: "issue",
      targetNumber: 506,
      receivedAt: 1_000,
    });
    const res = await postWebhook(db, {
      repoId: repo.id,
      body,
      deliveryId: "delivery-non-gating",
    });

    expect(res.statusCode).toBe(200);
    expect(jsonBody(res)).toEqual({ ok: true, deduped: true });
    expect(listWebhookEvents(db)[0]?.intentId).toBeNull();
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get(),
    ).toEqual({ count: 0 });
  });

  it("does not repair deduped unrelated issue label removals into kill-switch intents", async () => {
    const body = JSON.stringify({
      action: "unlabeled",
      repository: { full_name: "mean-weasel/issuectl" },
      issue: { number: 506 },
      label: { name: "bug" },
      sender: { login: "octocat" },
    });
    recordWebhookEvent(db, {
      deliveryId: "delivery-deduped-unrelated-label",
      repoId: repo.id,
      eventType: "issues",
      action: "unlabeled",
      senderLogin: "octocat",
      targetType: "issue",
      targetNumber: 506,
      receivedAt: 1_000,
    });

    const res = await postWebhook(db, {
      repoId: repo.id,
      body,
      deliveryId: "delivery-deduped-unrelated-label",
    });

    expect(res.statusCode).toBe(200);
    expect(jsonBody(res)).toEqual({ ok: true, deduped: true });
    expect(listWebhookEvents(db)[0]?.intentId).toBeNull();
    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get()).toEqual({ count: 0 });
  });

  it("records metadata-only events by default", async () => {
    const body = JSON.stringify(issuesOpenedPayload());
    const res = await postWebhook(db, { repoId: repo.id, body });

    expect(res.statusCode).toBe(200);
    expect(jsonBody(res)).toEqual({ ok: true, eventId: 1, intentId: 1 });
    expect(listWebhookEvents(db)[0]).toEqual(
      expect.objectContaining({
        eventType: "issues",
        action: "opened",
        senderLogin: "octocat",
        targetType: "issue",
        targetNumber: 506,
        payloadJson: null,
      }),
    );
    expect(queryDiagnosticEvents(db, { events: ["webhook.received"] })).toEqual([
      expect.objectContaining({
        owner: "mean-weasel",
        repo: "issuectl",
        issueNumber: 506,
        targetType: "issue",
        targetNumber: 506,
        correlationId: "delivery-1",
        data: expect.not.objectContaining({
          webhookSecret: expect.anything(),
          signature: expect.anything(),
          payloadJson: expect.anything(),
        }),
      }),
    ]);
    expect(queryDiagnosticEvents(db, { events: ["webhook.debouncing"] })).toHaveLength(1);
  });


  it("stores raw payloads with a retention tombstone when raw mode is enabled", async () => {
    updateRepoWebhookSettings(db, repo.id, { webhookPayloadMode: "raw" });
    const body = JSON.stringify(issuesOpenedPayload());
    await postWebhook(db, { repoId: repo.id, body });

    const event = listWebhookEvents(db)[0];
    const delivery = db
      .prepare("SELECT retained_until FROM webhook_deliveries WHERE delivery_id = ?")
      .get("delivery-1") as { retained_until: number | null };

    expect(event?.payloadJson).toBe(body);
    expect(delivery.retained_until).toBeGreaterThan(event?.receivedAt ?? 0);
  });

  it("creates an intent for issues opened", async () => {
    const body = JSON.stringify(issuesOpenedPayload());
    const res = await postWebhook(db, { repoId: repo.id, body });

    const responseBody = jsonBody(res) as { intentId: number | null };
    const intent = db
      .prepare("SELECT * FROM webhook_intents WHERE id = ?")
      .get(responseBody.intentId) as Record<string, unknown>;

    expect(intent).toMatchObject({
      repo_id: repo.id,
      target_type: "issue",
      target_number: 506,
      status: "pending",
      signal_count: 1,
    });
  });

  it("does not create kill-switch intents for unrelated issue label removals", async () => {
    const body = JSON.stringify({
      action: "unlabeled",
      repository: { full_name: "mean-weasel/issuectl" },
      issue: { number: 506 },
      label: { name: "bug" },
      sender: { login: "octocat" },
    });

    const res = await postWebhook(db, {
      repoId: repo.id,
      body,
      deliveryId: "delivery-unrelated-label",
    });

    expect(res.statusCode).toBe(200);
    expect(jsonBody(res)).toEqual({ ok: true, eventId: 1, intentId: null });
    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get()).toEqual({ count: 0 });
    expect(queryDiagnosticEvents(db, { events: ["webhook.debouncing"] })).toHaveLength(0);
  });

  it("creates kill-switch intents when the issue auto-launch label is removed", async () => {
    const body = JSON.stringify({
      action: "unlabeled",
      repository: { full_name: "mean-weasel/issuectl" },
      issue: { number: 506 },
      label: { name: "issuectl:auto-launch" },
      sender: { login: "octocat" },
    });

    const res = await postWebhook(db, {
      repoId: repo.id,
      body,
      deliveryId: "delivery-auto-label",
    });

    expect(res.statusCode).toBe(200);
    expect(jsonBody(res)).toEqual({ ok: true, eventId: 1, intentId: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get()).toEqual({ count: 1 });
  });

  it("caps webhook debounce at the configured max window", async () => {
    setSetting(db, "webhook_debounce_seconds", "60");
    setSetting(db, "webhook_max_debounce_seconds", "90");
    const first = await postWebhook(db, {
      repoId: repo.id,
      body: JSON.stringify(issuesOpenedPayload()),
      deliveryId: "delivery-debounce-1",
    });
    expect(first.statusCode).toBe(200);
    db.prepare("UPDATE webhook_events SET received_at = ? WHERE id = 1").run(1_000);
    db.prepare("UPDATE webhook_intents SET first_signal_at = ?, last_signal_at = ?, scheduled_at = ? WHERE id = 1").run(1_000, 1_000, 61_000);

    await postWebhook(db, {
      repoId: repo.id,
      body: JSON.stringify(issuesOpenedPayload()),
      deliveryId: "delivery-debounce-2",
    });

    expect(
      db.prepare("SELECT first_signal_at, scheduled_at, signal_count FROM webhook_intents WHERE id = 1").get(),
    ).toEqual({
      first_signal_at: 1_000,
      scheduled_at: 91_000,
      signal_count: 2,
    });
  });

  it("rejects new distinct-target intents at intake when queue depth is full", async () => {
    setSetting(db, "max_webhook_queue_depth", "1");
    await postWebhook(db, {
      repoId: repo.id,
      body: JSON.stringify(issuesOpenedPayload()),
      deliveryId: "delivery-queue-1",
    });
    const res = await postWebhook(db, {
      repoId: repo.id,
      body: JSON.stringify({
        ...issuesOpenedPayload(),
        issue: { number: 507 },
      }),
      deliveryId: "delivery-queue-2",
    });

    expect(res.statusCode).toBe(200);
    expect(jsonBody(res)).toEqual({ ok: true, eventId: 2, intentId: null });
    expect(db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get()).toEqual({ count: 1 });
    expect(queryDiagnosticEvents(db, { events: ["webhook.runaway_limited"] })).toEqual([
      expect.objectContaining({ issueNumber: 507 }),
    ]);
  });
});

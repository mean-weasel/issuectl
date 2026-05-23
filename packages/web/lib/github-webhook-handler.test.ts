import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  addRepo,
  initSchema,
  listWebhookEvents,
  recordWebhookEvent,
  seedDefaults,
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
    expect(JSON.parse(res.body)).toEqual({
      ok: false,
      error: "Method not allowed",
    });
  });

  it("rejects missing signatures with 401", async () => {
    const res = createResponse();

    await handleGithubWebhookRequest(
      db,
      createSignedRequest({ repoId: repo.id, signature: null }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("rejects invalid signatures with 401", async () => {
    const res = createResponse();

    await handleGithubWebhookRequest(
      db,
      createSignedRequest({ repoId: repo.id, signature: "sha256=bad" }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: "Unauthorized" });
  });

  it("rejects oversized bodies with 413", async () => {
    const res = createResponse();
    const body = "x".repeat(1024 * 1024 + 1);

    await handleGithubWebhookRequest(
      db,
      createSignedRequest({ repoId: repo.id, body }),
      res,
    );

    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body)).toEqual({
      ok: false,
      error: "Payload too large",
    });
  });

  it("rejects payloads whose repository does not match the route repo", async () => {
    const res = createResponse();
    const body = JSON.stringify(issuesOpenedPayload("other/repo"));

    await handleGithubWebhookRequest(
      db,
      createSignedRequest({ repoId: repo.id, body }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({
      ok: false,
      error: "Repository mismatch",
    });
  });

  it("dedupes repeated delivery ids", async () => {
    const body = JSON.stringify(issuesOpenedPayload());
    const first = createResponse();
    const second = createResponse();

    await handleGithubWebhookRequest(
      db,
      createSignedRequest({ repoId: repo.id, body, deliveryId: "delivery-1" }),
      first,
    );
    await handleGithubWebhookRequest(
      db,
      createSignedRequest({ repoId: repo.id, body, deliveryId: "delivery-1" }),
      second,
    );

    expect(first.statusCode).toBe(200);
    expect(JSON.parse(second.body)).toEqual({ ok: true, deduped: true });
    expect(listWebhookEvents(db)).toHaveLength(1);
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
    const res = createResponse();

    await handleGithubWebhookRequest(
      db,
      createSignedRequest({
        repoId: repo.id,
        body,
        deliveryId: "delivery-repair",
      }),
      res,
    );

    const responseBody = JSON.parse(res.body) as {
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
    const res = createResponse();

    await handleGithubWebhookRequest(
      db,
      createSignedRequest({
        repoId: repo.id,
        body,
        deliveryId: "delivery-non-gating",
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, deduped: true });
    expect(listWebhookEvents(db)[0]?.intentId).toBeNull();
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM webhook_intents").get(),
    ).toEqual({ count: 0 });
  });

  it("records metadata-only events by default", async () => {
    const res = createResponse();
    const body = JSON.stringify(issuesOpenedPayload());

    await handleGithubWebhookRequest(
      db,
      createSignedRequest({ repoId: repo.id, body }),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      ok: true,
      eventId: 1,
      intentId: 1,
    });
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
  });

  it("creates an intent for issues opened", async () => {
    const res = createResponse();
    const body = JSON.stringify(issuesOpenedPayload());

    await handleGithubWebhookRequest(
      db,
      createSignedRequest({ repoId: repo.id, body }),
      res,
    );

    const responseBody = JSON.parse(res.body) as { intentId: number | null };
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
});

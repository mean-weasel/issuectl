import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const createIssuectlWebhook = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const getRepoWebhookConfigById = vi.hoisted(() => vi.fn());
const getSetting = vi.hoisted(() => vi.fn());
const listRepos = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());
const rotateIssuectlWebhook = vi.hoisted(() => vi.fn());
const updateRepoWebhookSettings = vi.hoisted(() => vi.fn());
const pingWebhook = vi.hoisted(() => vi.fn());
const withAuthRetry = vi.hoisted(() => vi.fn((fn: (octokit: unknown) => unknown) => fn({
  rest: {
    repos: {
      pingWebhook,
    },
  },
})));

vi.mock("@issuectl/core", () => ({
  createIssuectlWebhook: (...args: unknown[]) => createIssuectlWebhook(...args),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
  getRepoWebhookConfigById: (...args: unknown[]) => getRepoWebhookConfigById(...args),
  getSetting: (...args: unknown[]) => getSetting(...args),
  listRepos: (...args: unknown[]) => listRepos(...args),
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
  rotateIssuectlWebhook: (...args: unknown[]) => rotateIssuectlWebhook(...args),
  updateRepoWebhookSettings: (...args: unknown[]) => updateRepoWebhookSettings(...args),
  withAuthRetry: (fn: (octokit: unknown) => unknown) => withAuthRetry(fn),
}));

import { POST } from "./route";

const repo = {
  id: 1,
  owner: "mean-weasel",
  name: "issuectl",
  webhookId: null,
};

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/repos/mean-weasel/issuectl/webhook", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue({});
  getRepo.mockReturnValue(repo);
  getRepoWebhookConfigById.mockReturnValue({ ...repo, webhookSecret: null });
  getSetting.mockReturnValue("https://hooks.example.test");
  createIssuectlWebhook.mockReset();
  createIssuectlWebhook.mockResolvedValue({ id: 123, createdBy: "jeremy" });
  rotateIssuectlWebhook.mockReset();
  rotateIssuectlWebhook.mockResolvedValue({ id: 456, createdBy: "jeremy" });
  pingWebhook.mockReset();
  pingWebhook.mockResolvedValue({});
  recordDiagnosticEventSafely.mockReset();
  updateRepoWebhookSettings.mockReset();
  updateRepoWebhookSettings.mockReturnValue({ ...repo, webhookId: 123 });
  withAuthRetry.mockClear();
});

describe("/api/v1/repos/[owner]/[repo]/webhook", () => {
  it("creates a webhook and stores only the id and generated secret", async () => {
    const response = await POST(request({ action: "create" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(createIssuectlWebhook).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      owner: "mean-weasel",
      repo: "issuectl",
      url: "https://hooks.example.test/api/webhook/github/1",
      secret: expect.any(String),
    }));
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(expect.anything(), 1, {
      webhookId: 123,
      webhookSecret: expect.any(String),
    });
    expect(json.webhook).toEqual({
      id: 123,
      url: "https://hooks.example.test/api/webhook/github/1",
      createdBy: "jeremy",
    });
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.webhook_reinstalled",
      owner: "mean-weasel",
      repo: "issuectl",
    }));
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "webhook.url_reconciled",
      owner: "mean-weasel",
      repo: "issuectl",
      data: expect.objectContaining({
        hookId: 123,
        url: "https://hooks.example.test/api/webhook/github/1",
      }),
    }));
    expect(JSON.stringify(json)).not.toContain("webhookSecret");
  });

  it("rotates an existing webhook id", async () => {
    getRepoWebhookConfigById.mockReturnValue({ ...repo, webhookId: 77, webhookSecret: "old" });
    updateRepoWebhookSettings.mockReturnValue({ ...repo, webhookId: 456 });

    const response = await POST(request({ action: "rotate" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });

    expect(response.status).toBe(200);
    expect(rotateIssuectlWebhook).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      hookId: 77,
      url: "https://hooks.example.test/api/webhook/github/1",
      secret: expect.any(String),
    }));
    expect(updateRepoWebhookSettings).toHaveBeenCalledWith(expect.anything(), 1, {
      webhookId: 456,
      webhookSecret: expect.any(String),
    });
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.webhook_secret_rotated",
    }));
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "webhook.url_reconciled",
      data: expect.objectContaining({ hookId: 456 }),
    }));
  });

  it("reinstalls by rotating an existing webhook id", async () => {
    getRepoWebhookConfigById.mockReturnValue({ ...repo, webhookId: 77, webhookSecret: "old" });
    updateRepoWebhookSettings.mockReturnValue({ ...repo, webhookId: 456 });

    const response = await POST(request({ action: "reinstall" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });

    expect(response.status).toBe(200);
    expect(rotateIssuectlWebhook).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      hookId: 77,
    }));
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.webhook_reinstalled",
    }));
  });

  it("reinstalls by creating when the stored webhook id is stale", async () => {
    getRepoWebhookConfigById.mockReturnValue({ ...repo, webhookId: 77, webhookSecret: "old" });
    rotateIssuectlWebhook.mockRejectedValue({ status: 404 });

    const response = await POST(request({ action: "reinstall" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(createIssuectlWebhook).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      owner: "mean-weasel",
      repo: "issuectl",
    }));
    expect(json.webhook.id).toBe(123);
  });

  it("sends a webhook ping without exposing secrets", async () => {
    getRepoWebhookConfigById.mockReturnValue({ ...repo, webhookId: 77, webhookSecret: "old" });

    const response = await POST(request({ action: "ping" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(pingWebhook).toHaveBeenCalledWith({
      owner: "mean-weasel",
      repo: "issuectl",
      hook_id: 77,
    });
    expect(rotateIssuectlWebhook).not.toHaveBeenCalled();
    expect(createIssuectlWebhook).not.toHaveBeenCalled();
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.webhook_ping_sent",
    }));
    expect(JSON.stringify(json)).not.toContain("webhookSecret");
  });

  it("rejects rotate when no webhook id is stored", async () => {
    const response = await POST(request({ action: "rotate" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/No webhook id/);
    expect(rotateIssuectlWebhook).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));

const getWebhookAutomationHealth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/webhook-health", () => ({
  getWebhookAutomationHealth: (...args: unknown[]) => getWebhookAutomationHealth(...args),
}));

const getDb = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
}));

import { GET } from "./route";

function request(): NextRequest {
  return new NextRequest("http://localhost/api/v1/repos/mean-weasel/issuectl/webhook/health");
}

beforeEach(() => {
  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue({});
  getRepo.mockReturnValue({ id: 1, owner: "mean-weasel", name: "issuectl" });
  getWebhookAutomationHealth.mockReset();
  getWebhookAutomationHealth.mockResolvedValue({
    state: "ok",
    summary: "Webhook is ready",
    detail: null,
    recovery: null,
    expectedUrl: "https://hooks.example.test/api/webhook/github/1",
    hookId: 123,
    githubUrl: "https://github.com/mean-weasel/issuectl/settings/hooks/123",
    latestDelivery: null,
  });
});

describe("/api/v1/repos/[owner]/[repo]/webhook/health", () => {
  it("returns webhook health for a tracked repo", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(getWebhookAutomationHealth).toHaveBeenCalledWith(expect.anything(), {
      id: 1,
      owner: "mean-weasel",
      name: "issuectl",
    });
    expect(json.health).toEqual(expect.objectContaining({
      state: "ok",
      hookId: 123,
    }));
  });

  it("returns 404 when the repo is not tracked", async () => {
    getRepo.mockReturnValue(null);

    const response = await GET(request(), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "missing" }),
    });
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toMatch(/not tracked/);
    expect(getWebhookAutomationHealth).not.toHaveBeenCalled();
  });
});

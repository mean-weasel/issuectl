import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const ensureLifecycleLabels = vi.hoisted(() => vi.fn());
const getDb = vi.hoisted(() => vi.fn());
const getRepo = vi.hoisted(() => vi.fn());
const listLabels = vi.hoisted(() => vi.fn());
const recordDiagnosticEventSafely = vi.hoisted(() => vi.fn());
const getLabel = vi.hoisted(() => vi.fn());
const createLabel = vi.hoisted(() => vi.fn());
const withAuthRetry = vi.hoisted(() => vi.fn((fn: (octokit: unknown) => unknown) => fn({
  rest: {
    issues: {
      getLabel,
      createLabel,
    },
  },
})));

vi.mock("@issuectl/core", () => ({
  ensureLifecycleLabels: (...args: unknown[]) => ensureLifecycleLabels(...args),
  formatErrorForUser: (err: unknown) => err instanceof Error ? err.message : String(err),
  getDb: () => getDb(),
  getRepo: (...args: unknown[]) => getRepo(...args),
  listLabels: (...args: unknown[]) => listLabels(...args),
  recordDiagnosticEventSafely: (...args: unknown[]) => recordDiagnosticEventSafely(...args),
  withAuthRetry: (fn: (octokit: unknown) => unknown) => withAuthRetry(fn),
}));

import { GET, POST } from "./route";

function request(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/repos/mean-weasel/issuectl/labels", {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue({});
  getRepo.mockReturnValue({ id: 1, owner: "mean-weasel", name: "issuectl" });
  listLabels.mockReset();
  listLabels.mockResolvedValue([{ name: "issuectl:auto-launch" }]);
  ensureLifecycleLabels.mockReset();
  ensureLifecycleLabels.mockResolvedValue(undefined);
  getLabel.mockReset();
  getLabel.mockRejectedValue({ status: 404 });
  createLabel.mockReset();
  createLabel.mockResolvedValue({});
  recordDiagnosticEventSafely.mockReset();
  withAuthRetry.mockClear();
});

describe("/api/v1/repos/[owner]/[repo]/labels", () => {
  it("lists labels for a tracked repo", async () => {
    const response = await GET(request(), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.labels).toEqual([{ name: "issuectl:auto-launch" }]);
  });

  it("recreates lifecycle labels and records diagnostics", async () => {
    const response = await POST(request({ action: "recreate" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(ensureLifecycleLabels).toHaveBeenCalledWith(expect.anything(), "mean-weasel", "issuectl");
    expect(createLabel).toHaveBeenCalledWith(expect.objectContaining({
      owner: "mean-weasel",
      repo: "issuectl",
      name: "issuectl:auto-launch",
    }));
    expect(createLabel).toHaveBeenCalledWith(expect.objectContaining({
      owner: "mean-weasel",
      repo: "issuectl",
      name: "issuectl:auto-review",
    }));
    expect(recordDiagnosticEventSafely).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      event: "repo.label_recreated",
      owner: "mean-weasel",
      repo: "issuectl",
    }));
  });

  it("rejects unknown label actions", async () => {
    const response = await POST(request({ action: "bad" }), {
      params: Promise.resolve({ owner: "mean-weasel", repo: "issuectl" }),
    });

    expect(response.status).toBe(400);
    expect(ensureLifecycleLabels).not.toHaveBeenCalled();
  });
});

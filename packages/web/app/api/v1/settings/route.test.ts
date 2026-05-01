import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const getDb = vi.hoisted(() => vi.fn());
const getSettings = vi.hoisted(() => vi.fn());
const setSetting = vi.hoisted(() => vi.fn());
const validateClaudeArgs = vi.hoisted(() => vi.fn());
const validateCodexArgs = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
  getSettings: (...args: unknown[]) => getSettings(...args),
  setSetting: (...args: unknown[]) => setSetting(...args),
  validateClaudeArgs: (...args: unknown[]) => validateClaudeArgs(...args),
  validateCodexArgs: (...args: unknown[]) => validateCodexArgs(...args),
  formatErrorForUser: (err: unknown) =>
    err instanceof Error ? err.message : String(err),
}));

import { GET, PATCH } from "./route";

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/settings", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireAuth.mockReset();
  getDb.mockReset();
  getSettings.mockReset();
  setSetting.mockReset();
  validateClaudeArgs.mockReset();
  validateCodexArgs.mockReset();

  requireAuth.mockReturnValue(null);
  getDb.mockReturnValue({});
  validateClaudeArgs.mockReturnValue({ ok: true, errors: [], warnings: [] });
  validateCodexArgs.mockReturnValue({ ok: true, errors: [], warnings: [] });
});

describe("/api/v1/settings", () => {
  it("GET includes launch agent and codex args settings", async () => {
    getSettings.mockReturnValue([
      { key: "launch_agent", value: "codex" },
      { key: "codex_extra_args", value: "--sandbox danger-full-access" },
      { key: "api_token", value: "secret" },
    ]);

    const response = await GET(new NextRequest("http://localhost/api/v1/settings"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.settings).toMatchObject({
      launch_agent: "codex",
      codex_extra_args: "--sandbox danger-full-access",
    });
    expect(json.settings.api_token).toBeUndefined();
  });

  it("PATCH saves launch_agent and codex_extra_args", async () => {
    const response = await PATCH(
      makePatchRequest({
        launch_agent: "codex",
        codex_extra_args: " --ask-for-approval never ",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(setSetting).toHaveBeenCalledWith(expect.anything(), "launch_agent", "codex");
    expect(setSetting).toHaveBeenCalledWith(
      expect.anything(),
      "codex_extra_args",
      "--ask-for-approval never",
    );
  });

  it("PATCH rejects an invalid launch_agent", async () => {
    const response = await PATCH(makePatchRequest({ launch_agent: "cursor" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/launch_agent/i);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it("PATCH rejects unsafe codex_extra_args", async () => {
    validateCodexArgs.mockReturnValueOnce({
      ok: false,
      errors: ["Shell operators not allowed."],
      warnings: [],
    });

    const response = await PATCH(makePatchRequest({ codex_extra_args: "--foo; rm" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/codex_extra_args/);
    expect(setSetting).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getDb = vi.hoisted(() => vi.fn());
const recordAgentCompletionCheckIn = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
}));

vi.mock("@/lib/agent/completion", () => ({
  recordAgentCompletionCheckIn: (...args: unknown[]) =>
    recordAgentCompletionCheckIn(...args),
  isAgentCompletionStatus: (value: unknown) =>
    ["completed", "failed", "no_changes", "pushed_fixes"].includes(String(value)),
}));

import { POST } from "./route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/agent/completion", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getDb.mockReturnValue("db");
  recordAgentCompletionCheckIn.mockReset();
});

describe("/api/v1/agent/completion", () => {
  it("records an authenticated completion check-in", async () => {
    recordAgentCompletionCheckIn.mockReturnValue({ accepted: true, duplicate: false });

    const response = await POST(request({
      deploymentId: 12,
      completionToken: "token-12",
      status: "pushed_fixes",
      summary: "fixed two findings",
      finalHeadSha: "head-b",
      pushedCommitSha: "fix-b",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ accepted: true, duplicate: false });
    expect(recordAgentCompletionCheckIn).toHaveBeenCalledWith("db", {
      deploymentId: 12,
      completionToken: "token-12",
      status: "pushed_fixes",
      summary: "fixed two findings",
      finalHeadSha: "head-b",
      pushedCommitSha: "fix-b",
    });
  });

  it("rejects malformed completion statuses", async () => {
    const response = await POST(request({
      deploymentId: 12,
      completionToken: "token-12",
      status: "done",
      summary: "done",
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/status/);
    expect(recordAgentCompletionCheckIn).not.toHaveBeenCalled();
  });
});

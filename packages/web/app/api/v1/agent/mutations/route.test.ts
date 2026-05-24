import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getDb = vi.hoisted(() => vi.fn());
const executeAgentMutationRequest = vi.hoisted(() => vi.fn());

vi.mock("@issuectl/core", () => ({
  getDb: () => getDb(),
}));

vi.mock("@/lib/agent/mutations", () => ({
  executeAgentMutationRequest: (...args: unknown[]) =>
    executeAgentMutationRequest(...args),
  isAgentMutationAction: (value: unknown) =>
    ["push", "comment", "label", "create_issue", "create_pr"].includes(String(value)),
}));

import { POST } from "./route";

function request(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/agent/mutations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getDb.mockReset();
  executeAgentMutationRequest.mockReset();
  getDb.mockReturnValue("db");
});

describe("/api/v1/agent/mutations", () => {
  it("denies a well-formed request when the daemon executor rejects it", async () => {
    executeAgentMutationRequest.mockResolvedValue({
      allowed: false,
      reason: "budget_exhausted",
    });

    const response = await POST(request({
      deploymentId: 12,
      completionToken: "token-12",
      repoId: 1,
      targetType: "pr",
      targetNumber: 44,
      actionType: "comment",
      payload: { body: "Done" },
    }));
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({
      allowed: false,
      reason: "budget_exhausted",
    });
    expect(executeAgentMutationRequest).toHaveBeenCalledWith("db", {
      deploymentId: 12,
      completionToken: "token-12",
      repoId: 1,
      targetType: "pr",
      targetNumber: 44,
      actionType: "comment",
      payload: { body: "Done" },
    });
  });

  it("rejects malformed request bodies before evaluating authorization", async () => {
    const response = await POST(request({
      deploymentId: 12,
      completionToken: "token-12",
      repoId: 1,
      targetType: "pr",
      targetNumber: 44,
      actionType: "merge",
    }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toMatch(/actionType/);
    expect(executeAgentMutationRequest).not.toHaveBeenCalled();
  });
});

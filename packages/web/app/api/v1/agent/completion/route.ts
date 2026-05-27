import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@issuectl/core";
import {
  cleanupCompletedIssueLifecycleLabels,
  isAgentCompletionStatus,
  recordAgentCompletionCheckIn,
} from "@/lib/agent/completion";
import type { AgentCompletionInput } from "@/lib/agent/completion";

export const dynamic = "force-dynamic";

type Body = {
  deploymentId?: unknown;
  completionToken?: unknown;
  status?: unknown;
  summary?: unknown;
  finalHeadSha?: unknown;
  pushedCommitSha?: unknown;
  pushedCommits?: unknown;
  changedFileCount?: unknown;
  fixedFindingCount?: unknown;
  errorMessage?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let parsed: AgentCompletionInput;
  try {
    parsed = parseBody(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid JSON body" },
      { status: 400 },
    );
  }

  const db = getDb();
  const result = recordAgentCompletionCheckIn(db, parsed);
  if (result.accepted && !result.duplicate) {
    await cleanupCompletedIssueLifecycleLabels(db, parsed.deploymentId);
  }
  return NextResponse.json(result, { status: result.accepted ? 200 : 403 });
}

function parseBody(body: Body): AgentCompletionInput {
  return {
    deploymentId: positiveInteger(body.deploymentId, "deploymentId"),
    completionToken: stringValue(body.completionToken, "completionToken"),
    status: statusValue(body.status),
    summary: stringValue(body.summary, "summary"),
    ...(optionalString(body.finalHeadSha, "finalHeadSha")),
    ...(optionalString(body.pushedCommitSha, "pushedCommitSha")),
    ...(optionalStringArray(body.pushedCommits, "pushedCommits")),
    ...(optionalNonNegativeInteger(body.changedFileCount, "changedFileCount")),
    ...(optionalNonNegativeInteger(body.fixedFindingCount, "fixedFindingCount")),
    ...(optionalString(body.errorMessage, "errorMessage")),
  };
}

function positiveInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function stringValue(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function optionalString(
  value: unknown,
  name: "finalHeadSha" | "pushedCommitSha" | "errorMessage",
): Partial<AgentCompletionInput> {
  if (value === undefined) return {};
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return { [name]: value };
}

function optionalStringArray(value: unknown, name: "pushedCommits"): Partial<AgentCompletionInput> {
  if (value === undefined) return {};
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${name} must be an array of non-empty strings`);
  }
  return { [name]: value };
}

function optionalNonNegativeInteger(
  value: unknown,
  name: "changedFileCount" | "fixedFindingCount",
): Partial<AgentCompletionInput> {
  if (value === undefined) return {};
  if (!Number.isInteger(value) || typeof value !== "number" || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return { [name]: value };
}

function statusValue(value: unknown): AgentCompletionInput["status"] {
  if (!isAgentCompletionStatus(value)) {
    throw new Error("status is not supported");
  }
  return value;
}

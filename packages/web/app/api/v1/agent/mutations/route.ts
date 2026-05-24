import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@issuectl/core";
import {
  executeAgentMutationRequest,
  isAgentMutationAction,
} from "@/lib/agent/mutations";
import type { AgentMutationRequest } from "@/lib/agent/mutations";

export const dynamic = "force-dynamic";

type Body = {
  deploymentId?: unknown;
  completionToken?: unknown;
  repoId?: unknown;
  targetType?: unknown;
  targetNumber?: unknown;
  actionType?: unknown;
  payload?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  let parsed: AgentMutationRequest;
  try {
    parsed = parseBody(await request.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid JSON body" },
      { status: 400 },
    );
  }

  const decision = await executeAgentMutationRequest(getDb(), parsed);
  if (!decision.allowed) {
    return NextResponse.json(decision, { status: 403 });
  }

  return NextResponse.json(decision);
}

function parseBody(body: Body): AgentMutationRequest {
  return {
    deploymentId: positiveInteger(body.deploymentId, "deploymentId"),
    completionToken: stringValue(body.completionToken, "completionToken"),
    repoId: positiveInteger(body.repoId, "repoId"),
    targetType: targetTypeValue(body.targetType),
    targetNumber: positiveInteger(body.targetNumber, "targetNumber"),
    actionType: actionTypeValue(body.actionType),
    payload: body.payload,
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

function targetTypeValue(value: unknown): AgentMutationRequest["targetType"] {
  if (value !== "issue" && value !== "pr") {
    throw new Error("targetType must be issue or pr");
  }
  return value;
}

function actionTypeValue(value: unknown): AgentMutationRequest["actionType"] {
  if (!isAgentMutationAction(value)) {
    throw new Error("actionType is not supported");
  }
  return value;
}

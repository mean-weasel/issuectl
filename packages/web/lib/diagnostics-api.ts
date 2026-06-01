import { NextRequest, NextResponse } from "next/server";
import {
  dbExists,
  formatErrorForUser,
  getDb,
  queryDiagnosticEvents,
} from "@issuectl/core";
import log from "@/lib/logger";
import {
  buildDiagnosticsPayload,
  parseLimit,
  parsePositiveInt,
} from "@/lib/mobile-api-contracts";

const DEFAULT_DIAGNOSTIC_LIMIT = 50;
const MAX_DIAGNOSTIC_LIMIT = 200;

export type DeploymentDiagnosticsParams =
  | {
      deploymentId: number;
      limit: number;
    }
  | { error: string };

export function parseDeploymentDiagnosticsParams(
  deploymentIdValue: string | null,
  limitValue: string | null,
): DeploymentDiagnosticsParams {
  const deploymentId = parsePositiveInt(deploymentIdValue);
  if (deploymentId === null) return { error: "Missing deployment id" };
  if (deploymentId === "invalid") return { error: "Invalid deployment id" };

  return {
    deploymentId,
    limit: parseLimit(limitValue, DEFAULT_DIAGNOSTIC_LIMIT, MAX_DIAGNOSTIC_LIMIT),
  };
}

export function deploymentDiagnosticsJson(deploymentId: number, limit: number): NextResponse {
  const events = dbExists()
    ? queryDiagnosticEvents(getDb(), { deploymentId, limit })
    : [];

  return NextResponse.json(buildDiagnosticsPayload({
    events,
    filters: {
      deploymentId,
      targetType: null,
      targetNumber: null,
      limit,
    },
  }));
}

export function diagnosticsRouteError(err: unknown, msg: string): NextResponse {
  log.error({ err, msg });
  return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
}

export function limitFromRequest(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get("limit")
    ?? request.nextUrl.searchParams.get("diagnosticLimit");
}

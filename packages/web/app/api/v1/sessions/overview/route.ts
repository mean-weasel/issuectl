import { NextRequest, NextResponse } from "next/server";
import {
  dbExists,
  formatErrorForUser,
  getDb,
  queryDiagnosticEvents,
  type DeploymentTargetType,
  type DiagnosticQuery,
} from "@issuectl/core";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getSessionsOverviewData, normalizeSessionsFilters } from "@/lib/sessions-data";
import {
  buildDiagnosticsPayload,
  parseLimit,
  parsePositiveInt,
  parseTargetType,
} from "@/lib/mobile-api-contracts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const params = request.nextUrl.searchParams;
    const diagnosticFilters = parseDiagnosticFilters(params);
    if ("error" in diagnosticFilters) {
      return NextResponse.json({ error: diagnosticFilters.error }, { status: 400 });
    }

    const filters = normalizeSessionsFilters(Object.fromEntries(params.entries()));
    const overview = await getSessionsOverviewData(filters);
    const diagnosticEvents = dbExists()
      ? queryDiagnosticEvents(getDb(), diagnosticFilters.query)
      : [];

    return NextResponse.json({
      overview,
      diagnostics: buildDiagnosticsPayload({
        events: diagnosticEvents,
        filters: diagnosticFilters.responseFilters,
      }),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    log.error({ err, msg: "api_sessions_overview_failed" });
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}

type DiagnosticFilters =
  | {
      query: DiagnosticQuery;
      responseFilters: {
        deploymentId: number | null;
        targetType: DeploymentTargetType | null;
        targetNumber: number | null;
        limit: number;
      };
    }
  | { error: string };

function parseDiagnosticFilters(params: URLSearchParams): DiagnosticFilters {
  const deploymentId = parsePositiveInt(params.get("deploymentId"));
  const targetType = parseTargetType(params.get("targetType"));
  const targetNumber = parsePositiveInt(params.get("targetNumber"));
  const limit = parseLimit(params.get("diagnosticLimit") ?? params.get("limit"), 20, 100);

  if (deploymentId === "invalid") return { error: "Invalid deployment id" };
  if (targetType === "invalid") return { error: "Invalid target type" };
  if (targetNumber === "invalid") return { error: "Invalid target number" };

  const repoFilter = params.get("repo");
  const hasTargetFilter = targetType !== null || targetNumber !== null;
  if (hasTargetFilter && (!repoFilter || targetType === null || targetNumber === null)) {
    return { error: "Target diagnostics require repo, targetType, and targetNumber" };
  }

  const query: DiagnosticQuery = { limit };
  if (deploymentId !== null) {
    query.deploymentId = deploymentId;
  } else if (hasTargetFilter && repoFilter) {
    const [owner, repo] = repoFilter.split("/");
    if (!owner || !repo || targetType === null || targetNumber === null) {
      return { error: "Target diagnostics require repo, targetType, and targetNumber" };
    }
    query.target = {
      owner,
      repo,
      targetType,
      targetNumber,
    };
  }

  return {
    query,
    responseFilters: {
      deploymentId,
      targetType,
      targetNumber,
      limit,
    },
  };
}

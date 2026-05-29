import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  deploymentDiagnosticsJson,
  diagnosticsRouteError,
  limitFromRequest,
  parseDeploymentDiagnosticsParams,
} from "@/lib/diagnostics-api";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const parsed = parseDeploymentDiagnosticsParams(
      request.nextUrl.searchParams.get("deploymentId"),
      limitFromRequest(request),
    );
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    return deploymentDiagnosticsJson(parsed.deploymentId, parsed.limit);
  } catch (err) {
    return diagnosticsRouteError(err, "api_diagnostics_failed");
  }
}

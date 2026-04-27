import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { ensureTtydForDeployment } from "@/lib/ensure-ttyd";
import log from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id: idStr } = await params;
  const deploymentId = parseInt(idStr, 10);
  if (Number.isNaN(deploymentId) || deploymentId <= 0) {
    return NextResponse.json({ alive: false, error: "Invalid deployment ID" }, { status: 400 });
  }

  const result = await ensureTtydForDeployment(deploymentId);
  if ("respawned" in result && result.respawned) {
    log.info({ msg: "ttyd_respawned", deploymentId, port: result.port });
  }
  if (result.alive === false && result.error) {
    log.error({ msg: "ensure_ttyd_failed", deploymentId, error: result.error });
  }
  return NextResponse.json(result);
}

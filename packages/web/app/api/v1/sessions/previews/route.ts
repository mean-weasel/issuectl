import { NextRequest, NextResponse } from "next/server";
import { getActiveDeployments, getDb } from "@issuectl/core";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getSessionPreviews } from "@/lib/session-previews";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const db = getDb();
    const deployments = getActiveDeployments(db);
    const previews = await getSessionPreviews(deployments);
    return NextResponse.json({ previews });
  } catch (err) {
    log.error({ err, msg: "api_session_previews_failed" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

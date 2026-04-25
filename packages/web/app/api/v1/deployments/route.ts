import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getDb, getActiveDeployments } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const db = getDb();
    const deployments = getActiveDeployments(db);
    return NextResponse.json({ deployments });
  } catch (err) {
    console.error("[issuectl] GET /api/v1/deployments failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    return NextResponse.json({
      ok: true,
      version: process.env.npm_package_version ?? "0.0.0",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[issuectl] GET /api/v1/health failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { batchCreateIssues } from "@/lib/actions/parse";

export const dynamic = "force-dynamic";

const MAX_BATCH_SIZE = 25;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const issues = body?.issues;

    if (!Array.isArray(issues) || issues.length === 0) {
      return NextResponse.json(
        { error: "Request body must include a non-empty 'issues' array" },
        { status: 400 },
      );
    }

    if (issues.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH_SIZE} issues per batch` },
        { status: 400 },
      );
    }

    const result = await batchCreateIssues(issues);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[issuectl] POST /api/v1/parse/create failed:", err);
    return NextResponse.json(
      { error: "Failed to create issues" },
      { status: 500 },
    );
  }
}

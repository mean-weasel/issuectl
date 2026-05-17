import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getWorkbenchPayload } from "@/lib/workbench-data";
import { formatErrorForUser } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    return NextResponse.json(await getWorkbenchPayload());
  } catch (err) {
    log.error({ err, msg: "api_workbench_get_failed" });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

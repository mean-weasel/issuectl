import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { withAuthRetry, formatErrorForUser } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const result = await withAuthRetry(async (octokit) => {
      const { data } = await octokit.rest.users.getAuthenticated();
      return { login: data.login };
    });
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err, msg: "api_user_failed" });
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}

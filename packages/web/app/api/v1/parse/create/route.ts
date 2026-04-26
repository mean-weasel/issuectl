import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { formatErrorForUser } from "@issuectl/core";
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

    for (const issue of issues) {
      if (
        typeof issue.title !== "string" ||
        typeof issue.owner !== "string" ||
        typeof issue.repo !== "string" ||
        typeof issue.accepted !== "boolean"
      ) {
        return NextResponse.json(
          {
            error:
              "Each issue must have title (string), owner (string), repo (string), and accepted (boolean)",
          },
          { status: 400 },
        );
      }
    }

    const result = await batchCreateIssues(issues);
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err, msg: "api_parse_create_failed" });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { formatErrorForUser } from "@issuectl/core";
import { parseNaturalLanguage } from "@/lib/actions/parse";

export const dynamic = "force-dynamic";

const MAX_PARSE_INPUT = 8192;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const body = await request.json();
    const input = body?.input;

    if (typeof input !== "string" || !input.trim()) {
      return NextResponse.json(
        { error: "Request body must include a non-empty 'input' string" },
        { status: 400 },
      );
    }

    if (input.length > MAX_PARSE_INPUT) {
      return NextResponse.json(
        { error: `Input must be ${MAX_PARSE_INPUT} characters or fewer` },
        { status: 400 },
      );
    }

    const result = await parseNaturalLanguage(input);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json(result.data);
  } catch (err) {
    log.error({ err, msg: "api_parse_failed" });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

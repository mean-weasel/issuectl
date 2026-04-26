import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  listDrafts,
  createDraft,
  formatErrorForUser,
  type DraftInput,
  type Priority,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const VALID_PRIORITIES: readonly string[] = ["low", "normal", "high"];
const MAX_TITLE = 256;
const MAX_BODY = 65536;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const db = getDb();
    const drafts = listDrafts(db);
    log.info({ msg: "api_drafts_listed", count: drafts.length });
    return NextResponse.json({ drafts });
  } catch (err) {
    log.error({ err, msg: "api_drafts_list_failed" });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

type CreateBody = {
  title: string;
  body?: string;
  priority?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  let body: CreateBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (body.title.length > MAX_TITLE) {
    return NextResponse.json(
      { error: `Title must be ${MAX_TITLE} characters or fewer` },
      { status: 400 },
    );
  }
  if (body.body !== undefined) {
    if (typeof body.body !== "string") {
      return NextResponse.json({ error: "Body must be a string" }, { status: 400 });
    }
    if (body.body.length > MAX_BODY) {
      return NextResponse.json(
        { error: `Body must be ${MAX_BODY} characters or fewer` },
        { status: 400 },
      );
    }
  }
  if (body.priority !== undefined && !VALID_PRIORITIES.includes(body.priority)) {
    return NextResponse.json(
      { error: "Priority must be low, normal, or high" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const input: DraftInput = {
      title: body.title,
      body: body.body,
      priority: body.priority as Priority | undefined,
    };
    const draft = createDraft(db, input);
    log.info({ msg: "api_draft_created", draftId: draft.id });
    return NextResponse.json({ success: true, id: draft.id });
  } catch (err) {
    log.error({ err, msg: "api_draft_create_failed" });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  deleteDraft,
  updateDraft,
  formatErrorForUser,
  type DraftUpdate,
  type Priority,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_PRIORITIES: readonly string[] = ["low", "normal", "high"];
const MAX_TITLE = 256;
const MAX_BODY = 65536;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
  }

  try {
    const db = getDb();
    const deleted = deleteDraft(db, id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Draft not found" }, { status: 404 });
    }
    log.info({ msg: "api_draft_deleted", draftId: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_draft_delete_failed", draftId: id });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

type PatchBody = {
  title?: string;
  body?: string;
  priority?: string;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid draft id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate fields
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json({ error: "Title must be a non-empty string" }, { status: 400 });
    }
    if (body.title.length > MAX_TITLE) {
      return NextResponse.json(
        { error: `Title must be ${MAX_TITLE} characters or fewer` },
        { status: 400 },
      );
    }
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
    const update: DraftUpdate = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.body !== undefined) update.body = body.body;
    if (body.priority !== undefined) update.priority = body.priority as Priority;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const draft = updateDraft(db, id, update);
    if (!draft) {
      return NextResponse.json({ success: false, error: "Draft not found" }, { status: 404 });
    }
    log.info({ msg: "api_draft_updated", draftId: id });
    return NextResponse.json({ success: true, draft });
  } catch (err) {
    log.error({ err, msg: "api_draft_update_failed", draftId: id });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

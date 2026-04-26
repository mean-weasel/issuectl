import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { getDb, deleteDraft, formatErrorForUser } from "@issuectl/core";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Draft id is required" }, { status: 400 });
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

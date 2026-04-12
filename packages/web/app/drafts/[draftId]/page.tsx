import { notFound } from "next/navigation";
import { getDb, getDraft } from "@issuectl/core";
import { DraftDetail } from "@/components/detail/DraftDetail";

export const dynamic = "force-dynamic";

type Params = {
  draftId: string;
};

// Draft IDs come from randomUUID() (see packages/core/src/db/drafts.ts).
// Reject anything that doesn't match before touching the DB so malformed
// path segments (null bytes, path-traversal attempts, arbitrary strings)
// short-circuit to 404 without a query round-trip.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { draftId } = await params;
  if (!UUID_RE.test(draftId)) {
    notFound();
  }
  const db = getDb();
  const draft = getDraft(db, draftId);
  if (!draft) {
    notFound();
  }

  return <DraftDetail draft={draft} />;
}

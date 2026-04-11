import { notFound } from "next/navigation";
import { getDb, getDraft } from "@issuectl/core";
import { DraftDetail } from "@/components/detail/DraftDetail";

export const dynamic = "force-dynamic";

type Params = {
  draftId: string;
};

export default async function DraftDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { draftId } = await params;
  const db = getDb();
  const draft = getDraft(db, draftId);
  if (!draft) {
    notFound();
  }

  return <DraftDetail draft={draft} />;
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/paper";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { BottomHandle } from "@/components/list/BottomHandle";
import { AssignSheet } from "@/components/list/AssignSheet";
import { deleteDraftAction } from "@/lib/actions/drafts";
import { useToast } from "@/components/ui/ToastProvider";
import styles from "./ActionSheet.module.css";

type Props = {
  draftId: string;
  draftTitle: string;
};

export function DraftActionSheet({ draftId, draftTitle }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAssign() {
    setSheetOpen(false);
    setAssignOpen(true);
  }

  function handleDeleteTap() {
    setSheetOpen(false);
    setConfirmDelete(true);
  }

  function handleDeleteConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteDraftAction(draftId);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setConfirmDelete(false);
        showToast("Draft deleted", "success");
        router.replace("/?section=unassigned");
      } catch (err) {
        console.error("[issuectl] deleteDraftAction threw:", err);
        setError("Unable to reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <>
      <BottomHandle
        onTrigger={() => setSheetOpen(true)}
        label="Actions"
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="draft actions"
      >
        <button className={styles.item} onClick={handleAssign}>
          <span className={styles.icon}>&rarr;</span>
          Assign to repo
        </button>
        <button
          className={`${styles.item} ${styles.danger}`}
          onClick={handleDeleteTap}
        >
          <span className={styles.icon}>&times;</span>
          Delete draft
        </button>
      </Sheet>

      <AssignSheet
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        draftId={draftId}
        draftTitle={draftTitle}
      />

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Draft"
          message={`Delete \u201c${draftTitle}\u201d? This draft is local-only and cannot be recovered.`}
          confirmLabel="Delete Draft"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setConfirmDelete(false)}
          isPending={isPending}
          error={error ?? undefined}
        />
      )}
    </>
  );
}

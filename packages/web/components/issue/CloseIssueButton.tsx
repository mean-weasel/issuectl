"use client";

import { useState, useTransition } from "react";
import { closeIssue } from "@/lib/actions/issues";
import { Button } from "@/components/paper";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/ToastProvider";

type Props = {
  owner: string;
  repo: string;
  number: number;
  isClosed: boolean;
};

export function CloseIssueButton({ owner, repo, number, isClosed }: Props) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isClosed) return null;

  function handleClose() {
    setError(null);
    startTransition(async () => {
      const result = await closeIssue(owner, repo, number);
      if (!result.success) {
        setError(result.error ?? "Failed to close issue. Please try again.");
        return;
      }
      setShowConfirm(false);
      showToast("Issue closed", "success");
    });
  }

  return (
    <>
      <Button variant="ghost" onClick={() => setShowConfirm(true)}>
        Close
      </Button>
      {showConfirm && (
        <ConfirmDialog
          title="Close Issue"
          message={`Close issue #${number}? This can be reopened later from GitHub.`}
          confirmLabel="Close Issue"
          onConfirm={handleClose}
          onCancel={() => setShowConfirm(false)}
          isPending={isPending}
          error={error ?? undefined}
        />
      )}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { closeIssue } from "@/lib/actions/issues";
import { Button } from "@/components/ui/Button";
import styles from "./CloseIssueButton.module.css";

type Props = {
  owner: string;
  repo: string;
  number: number;
  isClosed: boolean;
};

export function CloseIssueButton({ owner, repo, number, isClosed }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isClosed) return null;

  function handleClose() {
    setShowConfirm(false);
    setError(null);
    startTransition(async () => {
      const result = await closeIssue(owner, repo, number);
      if (!result.success) {
        setError(result.error ?? "Failed to close issue. Please try again.");
        setShowConfirm(true);
      }
    });
  }

  if (showConfirm) {
    return (
      <>
        {error && (
          <span className={styles.error} role="alert">
            {error}
          </span>
        )}
        <Button variant="ghost" onClick={() => setShowConfirm(false)}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          onClick={handleClose}
          disabled={isPending}
          className={styles.danger}
        >
          {isPending ? "Closing..." : "Confirm Close"}
        </Button>
      </>
    );
  }

  return (
    <Button variant="secondary" onClick={() => setShowConfirm(true)}>
      Close
    </Button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { reopenIssue } from "@/lib/actions/issues";
import { useToast } from "@/components/ui/ToastProvider";
import styles from "./ReopenButton.module.css";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
};

export function ReopenButton({ owner, repo, issueNumber }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleReopen() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await reopenIssue(owner, repo, issueNumber);
        if (!result.success) {
          setError(result.error);
          return;
        }
        showToast(
          result.cacheStale
            ? "Issue reopened — reload if the page looks stale"
            : "Issue reopened",
          "success",
        );
        router.refresh();
      } catch (err) {
        console.error("[issuectl] Reopen issue failed:", err);
        setError("Something went wrong while reopening the issue. Please try again.");
      }
    });
  }

  return (
    <div>
      <Button variant="primary" onClick={handleReopen} disabled={isPending}>
        {isPending ? "Reopening..." : "Reopen Issue"}
      </Button>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

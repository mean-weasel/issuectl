"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { endSession } from "@/lib/actions/launch";
import styles from "./TerminalPanel.module.css";

type Props = {
  open: boolean;
  onClose: () => void;
  ttydPort: number;
  deploymentId: number;
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
};

export function TerminalPanel({
  open,
  onClose,
  ttydPort,
  deploymentId,
  owner,
  repo,
  issueNumber,
  issueTitle,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleEndSession() {
    setError(null);
    startTransition(async () => {
      const result = await endSession(deploymentId, owner, repo, issueNumber);
      if (result.success) {
        onClose();
        router.refresh();
      } else {
        setError(result.error ?? "Failed to end session");
      }
    });
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <div className={styles.overlay} data-open={open}>
      <div className={styles.panel} data-open={open}>
        <div className={styles.handle} onClick={onClose} title="Close terminal">
          <span className={styles.handleChevron}>{"\u203A"}</span>
        </div>
        <div className={styles.header}>
          <span className={styles.headerTitle}>
            #{issueNumber} — {issueTitle}
          </span>
          {error && <span className={styles.headerError}>{error}</span>}
          <Button
            variant="ghost"
            onClick={handleEndSession}
            disabled={isPending}
          >
            {isPending ? "Ending..." : "End Session"}
          </Button>
        </div>
        {open && (
          <iframe
            className={styles.terminalFrame}
            src={`http://localhost:${ttydPort}`}
            title={`Terminal — Issue #${issueNumber}`}
          />
        )}
      </div>
    </div>
  );
}

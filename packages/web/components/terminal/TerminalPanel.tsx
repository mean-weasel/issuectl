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
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel} data-open={open}>
        <div className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => {
              if (window.history.length > 1) {
                onClose();
              } else {
                router.push(`/issues/${owner}/${repo}/${issueNumber}`);
              }
            }}
            aria-label="Back to issue"
          >
            <svg
              width="12"
              height="20"
              viewBox="0 0 12 20"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M10 2L2 10L10 18"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            className={styles.closeButton}
            onClick={onClose}
            title="Close terminal"
            aria-label="Close terminal"
          >
            {"\u00D7"}
          </button>
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
        <iframe
          className={styles.terminalFrame}
          src={`/api/terminal/${ttydPort}/`}
          title={`Terminal — Issue #${issueNumber}`}
        />
      </div>
    </div>
  );
}

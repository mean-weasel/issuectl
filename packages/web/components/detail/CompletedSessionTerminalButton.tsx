"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/paper";
import { getCompletedSessionTranscript } from "@/lib/actions/completed-terminal";
import styles from "./IssueDetail.module.css";

type Props = {
  deploymentId: number;
  owner: string;
  repo: string;
  issueNumber: number;
  targetType?: "issue" | "pr";
  targetNumber?: number;
};

export function CompletedSessionTerminalButton({
  deploymentId,
  owner,
  repo,
  issueNumber,
  targetType = "issue",
  targetNumber = issueNumber,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setError(null);
    startTransition(async () => {
      const result = await getCompletedSessionTranscript({
        deploymentId,
        owner,
        repo,
        targetType,
        targetNumber,
      });
      if (!result.success) {
        setTranscript(null);
        setSessionName(null);
        setError(result.error);
        setOpen(true);
        return;
      }
      setSessionName(result.sessionName);
      setTranscript(result.transcript);
      setOpen(true);
    });
  }

  return (
    <>
      <Button variant="primary" onClick={handleOpen} disabled={isPending}>
        {isPending ? "Loading..." : "View completed terminal"}
      </Button>
      {open && (
        <div className={styles.completedTerminalOverlay} role="dialog" aria-modal="true" aria-label="Completed terminal transcript">
          <button
            type="button"
            className={styles.completedTerminalBackdrop}
            aria-label="Close completed terminal transcript"
            onClick={() => setOpen(false)}
          />
          <div className={styles.completedTerminalPanel}>
            <div className={styles.completedTerminalHeader}>
              <div>
                <p className={styles.completedSessionEyebrow}>Completed terminal</p>
                <h2>Session #{deploymentId}</h2>
                {sessionName && <span>{sessionName}</span>}
              </div>
              <button
                type="button"
                className={styles.completedTerminalClose}
                onClick={() => setOpen(false)}
                aria-label="Close completed terminal transcript"
              >
                {"\u00D7"}
              </button>
            </div>
            {error ? (
              <p className={styles.completedTerminalError} role="alert">{error}</p>
            ) : (
              <pre className={styles.completedTerminalPre}>{transcript}</pre>
            )}
          </div>
        </div>
      )}
    </>
  );
}

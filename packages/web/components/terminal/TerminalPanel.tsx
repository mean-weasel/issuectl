"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { endSession } from "@/lib/actions/launch";
import styles from "./TerminalPanel.module.css";

type ConnectionStatus = "connecting" | "connected" | "error";

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
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
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

  /* Reset connection status whenever the panel opens */
  useEffect(() => {
    if (open) {
      setConnectionStatus("connecting");
    }
  }, [open]);

  /* Focus the iframe when the panel opens and is connected */
  useEffect(() => {
    if (!open || connectionStatus !== "connected") return;
    // Small delay lets the slide-in transition finish so the iframe is visible
    const timer = setTimeout(() => {
      iframeRef.current?.focus();
    }, 350);
    return () => clearTimeout(timer);
  }, [open, connectionStatus]);

  const handleIframeLoad = useCallback(() => {
    setConnectionStatus("connected");
  }, []);

  const handleIframeError = useCallback(() => {
    setConnectionStatus("error");
  }, []);

  function handleRetry() {
    setConnectionStatus("connecting");
    setIframeKey((k) => k + 1);
  }

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
          {connectionStatus === "connecting" && (
            <span className={styles.statusBadge} data-status="connecting">
              Connecting...
            </span>
          )}
          {connectionStatus === "connected" && (
            <span className={styles.statusBadge} data-status="connected">
              Connected
            </span>
          )}
          {connectionStatus === "error" && (
            <span className={styles.statusBadge} data-status="error">
              Disconnected
            </span>
          )}
          {error && <span className={styles.headerError}>{error}</span>}
          <Button
            variant="ghost"
            onClick={handleEndSession}
            disabled={isPending}
          >
            {isPending ? "Ending..." : "End Session"}
          </Button>
        </div>

        {/* Connection-error overlay */}
        {connectionStatus === "error" && (
          <div className={styles.connectionError}>
            <p className={styles.connectionErrorText}>
              Could not connect to the terminal.
            </p>
            <Button variant="primary" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        )}

        <iframe
          key={iframeKey}
          ref={iframeRef}
          className={styles.terminalFrame}
          src={`/api/terminal/${ttydPort}/`}
          title={`Terminal — Issue #${issueNumber}`}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          data-hidden={connectionStatus === "error"}
        />
      </div>
    </div>
  );
}

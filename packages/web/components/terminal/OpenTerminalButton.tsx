"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { TerminalPanel } from "./TerminalPanel";
import { checkSessionAlive, ensureTtyd } from "@/lib/actions/launch";
import styles from "./OpenTerminalButton.module.css";

const HEALTH_CHECK_INTERVAL_MS = 10_000;

type Props = {
  ttydPort: number;
  deploymentId: number;
  owner: string;
  repo: string;
  issueNumber: number;
  issueTitle: string;
};

export function OpenTerminalButton({
  ttydPort,
  deploymentId,
  owner,
  repo,
  issueNumber,
  issueTitle,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activePort, setActivePort] = useState(ttydPort);
  const [terminalToken, setTerminalToken] = useState<string | null>(null);
  const router = useRouter();

  // Sync activePort when the server re-renders with a new ttydPort
  useEffect(() => {
    setActivePort(ttydPort);
  }, [ttydPort]);

  useEffect(() => {
    if (isPending) return;

    const timer = setInterval(async () => {
      try {
        const { alive } = await checkSessionAlive(deploymentId);
        if (!alive) {
          clearInterval(timer);
          setOpen(false);
          router.refresh();
        }
      } catch {
        // Network error or server unavailable — skip this tick.
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [deploymentId, isPending, router]);

  function handleOpen() {
    setError(null);
    startTransition(async () => {
      const result = await ensureTtyd(deploymentId);
      if (!("port" in result) || result.port === null || result.port === undefined) {
        if ("error" in result && result.error) setError(result.error);
        router.refresh();
        return;
      }
      // Use the fresh port from ensureTtyd — the RSC-rendered ttydPort
      // may be stale if ttyd was respawned on a different port.
      setActivePort(result.port);
      setTerminalToken(result.terminalToken);
      setOpen(true);
    });
  }

  return (
    <>
      <Button variant="primary" onClick={handleOpen} disabled={isPending}>
        {isPending ? "Connecting..." : "Open Terminal"}
      </Button>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <TerminalPanel
        open={open}
        onClose={() => setOpen(false)}
        ttydPort={activePort}
        terminalToken={terminalToken}
        deploymentId={deploymentId}
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
        issueTitle={issueTitle}
      />
    </>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { TerminalPanel } from "./TerminalPanel";
import { checkTtydAlive } from "@/lib/actions/launch";

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
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(async () => {
      const { alive } = await checkTtydAlive(deploymentId);
      if (!alive) {
        clearInterval(timer);
        setOpen(false);
        router.refresh();
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [deploymentId, router]);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open Terminal
      </Button>
      <TerminalPanel
        open={open}
        onClose={() => setOpen(false)}
        ttydPort={ttydPort}
        deploymentId={deploymentId}
        owner={owner}
        repo={repo}
        issueNumber={issueNumber}
        issueTitle={issueTitle}
      />
    </>
  );
}

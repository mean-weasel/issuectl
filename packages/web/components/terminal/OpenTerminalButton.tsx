"use client";

import { useState } from "react";
import { Button } from "@/components/paper";
import { TerminalPanel } from "./TerminalPanel";

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

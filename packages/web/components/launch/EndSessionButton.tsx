"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { endSession } from "@/lib/actions/launch";
import styles from "./EndSessionButton.module.css";

type Props = {
  deploymentId: number;
  owner: string;
  repo: string;
  issueNumber: number;
};

export function EndSessionButton({ deploymentId, owner, repo, issueNumber }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleEnd() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await endSession(deploymentId, owner, repo, issueNumber);
        if (result.success) {
          router.refresh();
        } else {
          setError(result.error ?? "Failed to end session");
        }
      } catch (err) {
        console.error("[issuectl] EndSessionButton: endSession threw:", err);
        setError("Failed to end session — please try again");
      }
    });
  }

  return (
    <span className={styles.wrapper}>
      <Button variant="ghost" onClick={handleEnd} disabled={isPending}>
        {isPending ? "Ending..." : "End Session"}
      </Button>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </span>
  );
}

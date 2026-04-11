"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/paper";
import { endSession } from "@/lib/actions/launch";

type Props = {
  deploymentId: number;
  owner: string;
  repo: string;
  issueNumber: number;
};

export function EndSessionButton({ deploymentId, owner, repo, issueNumber }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleEnd() {
    startTransition(async () => {
      const result = await endSession(deploymentId, owner, repo, issueNumber);
      if (result.success) {
        router.refresh();
      }
    });
  }

  return (
    <Button variant="ghost" onClick={handleEnd} disabled={isPending}>
      {isPending ? "Ending..." : "End Session"}
    </Button>
  );
}

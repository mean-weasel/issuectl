"use client";

import { useState, useTransition } from "react";
import type { GitHubLabel } from "@issuectl/core";
import { toggleLabel } from "@/lib/actions/issues";
import { tryOrQueue } from "@/lib/tryOrQueue";
import { separateLabels } from "@/lib/labels";
import { useToast } from "@/components/ui/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { LabelSelector } from "./LabelSelector";
import styles from "./LabelManager.module.css";

type Props = {
  owner: string;
  repo: string;
  issueNumber: number;
  currentLabels: GitHubLabel[];
  availableLabels: GitHubLabel[];
};

export function LabelManager({
  owner,
  repo,
  issueNumber,
  currentLabels,
  availableLabels,
}: Props) {
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [showSelector, setShowSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { lifecycle: lifecycleLabels, regular: regularLabels } =
    separateLabels(currentLabels);
  const selectedNames = currentLabels.map((l) => l.name);

  function handleToggle(label: string) {
    setError(null);
    const action = selectedNames.includes(label) ? "remove" : "add";
    startTransition(async () => {
      const result = await tryOrQueue(
        "toggleLabel",
        { owner, repo, issueNumber, label, action },
        () => toggleLabel({ owner, repo, number: issueNumber, label, action }),
      );

      if (result.outcome === "queued") {
        showToast("Label change queued — will sync when online", "warning");
        return;
      }

      if (result.outcome === "error") {
        setError(result.error);
        return;
      }

      showToast("Labels updated", "success");
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Labels</span>
        <button
          type="button"
          className={styles.editButton}
          onClick={() => setShowSelector((s) => !s)}
        >
          {showSelector ? "Done" : "Edit"}
        </button>
      </div>

      {regularLabels.length > 0 && (
        <div className={styles.labels}>
          {regularLabels.map((l) => (
            <Badge key={l.name} label={l.name} color={l.color} />
          ))}
        </div>
      )}

      {lifecycleLabels.length > 0 && (
        <div className={styles.labels}>
          {lifecycleLabels.map((l) => (
            <Badge key={l.name} label={l.name} color={l.color} />
          ))}
        </div>
      )}

      {regularLabels.length === 0 && lifecycleLabels.length === 0 && !showSelector && (
        <span className={styles.empty}>No labels</span>
      )}

      {showSelector && (
        <div className={styles.selector}>
          <LabelSelector
            available={availableLabels}
            selected={selectedNames}
            onToggle={handleToggle}
            disabled={isPending}
          />
        </div>
      )}

      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

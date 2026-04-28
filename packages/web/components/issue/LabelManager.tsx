"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GitHubLabel } from "@issuectl/core";
import { toggleLabel } from "@/lib/actions/issues";
import { tryOrQueue } from "@/lib/tryOrQueue";
import { separateLabels } from "@/lib/labels";
import { useToast } from "@/components/ui/ToastProvider";
import { Badge } from "@/components/ui/Badge";
import { SyncDot } from "@/components/ui/SyncDot";
import { LabelSelector } from "./LabelSelector";
import styles from "./LabelManager.module.css";

const MIN_SYNC_DOT_MS = 1500;

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
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [syncVisible, setSyncVisible] = useState(false);
  const [showSelector, setShowSelector] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const syncStartRef = useRef(0);

  // Keep the syncing dot visible for at least one full pulse cycle (1.2s
  // animation in SyncDot.module.css). The 1500ms buffer prevents mid-fade
  // disappearance when the API responds faster than one cycle.
  useEffect(() => {
    if (isPending) {
      syncStartRef.current = Date.now();
      setSyncVisible(true);
      return;
    }
    if (!syncVisible) return;
    const elapsed = Date.now() - syncStartRef.current;
    const remaining = Math.max(0, MIN_SYNC_DOT_MS - elapsed);
    const timer = setTimeout(() => setSyncVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [isPending]); // syncVisible intentionally omitted — it's a gate, not a reactive dep

  const { lifecycle: lifecycleLabels, regular: regularLabels } =
    separateLabels(currentLabels);
  const selectedNames = currentLabels.map((l) => l.name);

  function handleToggle(label: string) {
    setError(null);
    const action = selectedNames.includes(label) ? "remove" : "add";
    startTransition(async () => {
      try {
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
        router.refresh();
      } catch (err) {
        console.error("[issuectl] toggleLabel threw:", err);
        setError(err instanceof Error ? err.message : "Failed to update label");
      }
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Labels</span>
        {syncVisible && <SyncDot status="syncing" label="syncing labels" />}
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

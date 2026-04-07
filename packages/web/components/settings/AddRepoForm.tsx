"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { addRepo } from "@/lib/actions/repos";
import { Button } from "@/components/ui/Button";
import styles from "./AddRepoForm.module.css";

type Props = {
  onClose: () => void;
};

export function AddRepoForm({ onClose }: Props) {
  const [ownerRepo, setOwnerRepo] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  function handleSubmit() {
    setError(null);
    setWarning(null);
    const parts = ownerRepo.trim().split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setError("Format: owner/repo (e.g., mean-weasel/seatify)");
      return;
    }

    startTransition(async () => {
      const result = await addRepo(
        parts[0],
        parts[1],
        localPath.trim() || undefined,
      );
      if (result.success) {
        if (result.warning) {
          setWarning(result.warning);
          timerRef.current = setTimeout(() => onClose(), 2000);
        } else {
          onClose();
        }
      } else {
        setError(result.error ?? "Failed to add repo");
      }
    });
  }

  return (
    <div className={styles.form}>
      <div className={styles.row}>
        <div className={styles.field}>
          <div className={styles.label}>Repository</div>
          <input
            className={styles.input}
            value={ownerRepo}
            onChange={(e) => setOwnerRepo(e.target.value)}
            placeholder="owner/repo (e.g., mean-weasel/seatify)"
            autoFocus
          />
        </div>
        <div className={styles.field}>
          <div className={styles.label}>Local Path (optional)</div>
          <input
            className={styles.input}
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="~/Desktop/seatify"
          />
          <div className={styles.pathHint}>Leave blank to prompt on launch</div>
        </div>
      </div>
      {error && (
        <span className={styles.error} role="alert">{error}</span>
      )}
      {warning && (
        <span className={styles.pathHint} style={{ color: "var(--yellow)" }} role="status">{warning}</span>
      )}
      <div className={styles.actions}>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={isPending || !ownerRepo.trim()}
        >
          {isPending ? "Adding..." : "Add Repo"}
        </Button>
      </div>
    </div>
  );
}

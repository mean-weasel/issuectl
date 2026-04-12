"use client";

import { useState, useEffect } from "react";
import { Sheet, Button } from "@/components/paper";
import { listReposAction, assignDraftAction } from "@/lib/actions/drafts";
import { useToast } from "@/components/ui/ToastProvider";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import styles from "./AssignSheet.module.css";

type Repo = { id: number; owner: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  draftId: string;
  draftTitle: string;
};

export function AssignSheet({ open, onClose, draftId, draftTitle }: Props) {
  const { showToast } = useToast();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    listReposAction()
      .then(setRepos)
      .catch(() => setError("Failed to load repos"))
      .finally(() => setLoading(false));
  }, [open]);

  const handleAssign = async (repoId: number) => {
    setAssigning(repoId);
    setError(null);
    const idempotencyKey = newIdempotencyKey();
    try {
      const result = await assignDraftAction(draftId, repoId, idempotencyKey);
      if (!result.success) {
        setError(result.error);
        return;
      }
      if (result.cleanupWarning) {
        showToast(result.cleanupWarning, "warning");
      } else {
        showToast(`Issue #${result.issueNumber} created`, "success");
      }
      onClose();
    } catch {
      setError("Failed to assign draft");
    } finally {
      setAssigning(null);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="assign to repo"
      description={<em>{draftTitle}</em>}
    >
      <div className={styles.body}>
        {loading && <div className={styles.loading}>loading repos…</div>}
        {error && <div className={styles.error}>{error}</div>}
        {!loading && repos.length === 0 && !error && (
          <div className={styles.empty}>
            <em>no repos tracked yet — add one in settings</em>
          </div>
        )}
        {repos.map((repo) => (
          <button
            key={repo.id}
            className={styles.row}
            onClick={() => handleAssign(repo.id)}
            disabled={assigning !== null}
          >
            <div className={styles.repoName}>{repo.name}</div>
            <div className={styles.repoOwner}>{repo.owner}</div>
            {assigning === repo.id && (
              <div className={styles.spinner}>assigning…</div>
            )}
          </button>
        ))}
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose} disabled={assigning !== null}>
            cancel
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const { showToast } = useToast();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoading(true);
    setSelectedRepoId(null);
    listReposAction()
      .then(setRepos)
      .catch(() => setError("Failed to load repos"))
      .finally(() => setLoading(false));
  }, [open]);

  const handleAssign = async () => {
    if (selectedRepoId === null) return;
    setAssigning(true);
    setError(null);
    const idempotencyKey = newIdempotencyKey();
    const repo = repos.find((r) => r.id === selectedRepoId);
    try {
      const result = await assignDraftAction(draftId, selectedRepoId, idempotencyKey);
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
      if (repo && result.issueNumber) {
        router.push(`/issues/${repo.owner}/${repo.name}/${result.issueNumber}`);
      } else {
        router.push("/");
      }
    } catch (err) {
      console.error("[issuectl] assignDraft threw:", err);
      setError(err instanceof Error ? err.message : "Failed to assign draft");
    } finally {
      setAssigning(false);
    }
  };

  const selectedRepo = repos.find((r) => r.id === selectedRepoId);

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
            className={
              repo.id === selectedRepoId ? styles.rowSelected : styles.row
            }
            onClick={() => setSelectedRepoId(repo.id)}
            disabled={assigning}
          >
            <div className={styles.repoName}>{repo.name}</div>
            <div className={styles.repoOwner}>{repo.owner}</div>
          </button>
        ))}
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose} disabled={assigning}>
            cancel
          </Button>
          {selectedRepo && (
            <Button
              variant="primary"
              onClick={handleAssign}
              disabled={assigning}
            >
              {assigning ? "assigning…" : `assign to ${selectedRepo.name}`}
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

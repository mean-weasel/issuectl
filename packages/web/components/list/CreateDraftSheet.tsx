"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Sheet } from "@/components/paper";
import {
  createDraftAction,
  listReposAction,
  assignDraftAction,
  getDefaultRepoIdAction,
  setDefaultRepoIdAction,
} from "@/lib/actions/drafts";
import { useToast } from "@/components/ui/ToastProvider";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import styles from "./CreateDraftSheet.module.css";

type Repo = { id: number; owner: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CreateDraftSheet({ open, onClose }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Repo selector state
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [defaultRepoId, setDefaultRepoId] = useState<number | null>(null);

  // Load repos and default repo when the sheet opens.
  useEffect(() => {
    if (!open) return;
    setSelectedRepoId(null);
    setLoadingRepos(true);
    Promise.all([listReposAction(), getDefaultRepoIdAction()])
      .then(([repoList, defaultId]) => {
        setRepos(repoList);
        // Pre-select default repo if it exists in the repo list.
        if (defaultId !== null && repoList.some((r) => r.id === defaultId)) {
          setSelectedRepoId(defaultId);
          setDefaultRepoId(defaultId);
        } else {
          setDefaultRepoId(null);
        }
      })
      .catch((err) => {
        console.error("[CreateDraftSheet] Failed to load repos", err);
        setRepos([]);
      })
      .finally(() => setLoadingRepos(false));
  }, [open]);

  const hasRepo = selectedRepoId !== null;

  const handleSave = async () => {
    if (title.trim().length === 0) {
      setError("A title is required");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // Persist the selected repo as the default for next time.
      if (selectedRepoId !== defaultRepoId) {
        // Fire-and-forget — don't block the save on this.
        setDefaultRepoIdAction(selectedRepoId).catch((err) => {
          console.warn("[CreateDraftSheet] Failed to save default repo", err);
        });
      }

      if (hasRepo) {
        // Create draft then immediately assign to the selected repo.
        const createResult = await createDraftAction({ title });
        if (!createResult.success) {
          setError(createResult.error);
          return;
        }
        const idempotencyKey = newIdempotencyKey();
        const assignResult = await assignDraftAction(
          createResult.id,
          selectedRepoId,
          idempotencyKey,
        );
        if (!assignResult.success) {
          // The draft was created but assignment failed. Navigate to the
          // draft so the user can retry assignment from there, rather
          // than leaving an invisible orphan.
          showToast("Issue creation failed — saved as draft", "warning");
          resetAndClose();
          router.push(`/drafts/${createResult.id}`);
          return;
        }
        const repo = repos.find((r) => r.id === selectedRepoId);
        if (assignResult.cleanupWarning) {
          showToast(assignResult.cleanupWarning, "warning");
        } else {
          showToast(`Issue #${assignResult.issueNumber} created`, "success");
        }
        resetAndClose();
        if (repo && assignResult.issueNumber) {
          router.push(
            `/issues/${repo.owner}/${repo.name}/${assignResult.issueNumber}`,
          );
        } else {
          router.push("/");
        }
      } else {
        // Save as local draft (existing behavior).
        const result = await createDraftAction({ title });
        if (!result.success) {
          setError(result.error);
          return;
        }
        resetAndClose();
      }
    } catch (err) {
      console.error("[CreateDraftSheet] handleSave failed", err);
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const resetAndClose = () => {
    setTitle("");
    setError(null);
    setSelectedRepoId(null);
    onClose();
  };

  const handleClose = () => {
    setTitle("");
    setError(null);
    setSelectedRepoId(null);
    onClose();
  };

  const description = hasRepo ? (
    <em>create a GitHub issue directly</em>
  ) : (
    <em>a local draft without a repo — assign it later</em>
  );

  return (
    <Sheet open={open} onClose={handleClose} title="New issue" description={description}>
      <div className={styles.form}>
        <label htmlFor="create-draft-title" className={styles.label}>
          Title
        </label>
        <input
          id="create-draft-title"
          className={styles.input}
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={saving}
          autoFocus
          maxLength={256}
          autoComplete="off"
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
          enterKeyHint="done"
          style={
            title.length > 50 ? { fontSize: 20, lineHeight: 1.3 } : undefined
          }
        />

        {/* Repo selector */}
        <div className={styles.repoSelector}>
          <label htmlFor="create-draft-repo" className={styles.repoLabel}>
            Repo (optional)
          </label>
          {loadingRepos ? (
            <div className={styles.repoLoading}>loading repos...</div>
          ) : (
            <select
              id="create-draft-repo"
              className={styles.repoSelect}
              value={selectedRepoId ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedRepoId(val ? Number(val) : null);
              }}
              disabled={saving || repos.length === 0}
            >
              <option value="">none — save as draft</option>
              {repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.owner}/{repo.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.actions}>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>
            cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || title.trim().length === 0}
          >
            {saving
              ? hasRepo
                ? "creating..."
                : "saving..."
              : hasRepo
                ? "create issue"
                : "save draft"}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
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

function buttonLabel(repoCount: number, saving: boolean): string {
  if (saving) return "creating\u2026";
  if (repoCount === 0) return "save draft";
  if (repoCount === 1) return "create issue";
  return `create ${repoCount} issues`;
}

export function CreateDraftSheet({ open, onClose }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepoIds, setSelectedRepoIds] = useState<Set<number>>(new Set());
  const [defaultRepoId, setDefaultRepoId] = useState<number | null>(null);

  // Load tracked repos and default repo when the sheet opens.
  useEffect(() => {
    if (!open) return;
    setSelectedRepoIds(new Set());
    setLoadingRepos(true);
    Promise.all([listReposAction(), getDefaultRepoIdAction()])
      .then(([repoList, defaultId]) => {
        setRepos(repoList);
        if (defaultId !== null && repoList.some((r) => r.id === defaultId)) {
          setSelectedRepoIds(new Set([defaultId]));
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

  const toggleRepo = (repoId: number) => {
    setSelectedRepoIds((prev) => {
      const next = new Set(prev);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (title.trim().length === 0) {
      setError("A title is required");
      return;
    }
    setSaving(true);
    setError(null);
    setProgress(null);

    const selected = Array.from(selectedRepoIds);

    // Persist the first selected repo as the default for next time.
    const firstSelected = selected[0] ?? null;
    if (firstSelected !== defaultRepoId) {
      setDefaultRepoIdAction(firstSelected).catch((err) => {
        console.warn("[CreateDraftSheet] Failed to save default repo", err);
      });
    }

    try {
      if (selected.length === 0) {
        // No repos selected — save as a plain draft.
        const result = await createDraftAction({ title });
        if (!result.success) {
          setError(result.error);
          return;
        }
        resetAndClose();
        return;
      }

      if (selected.length === 1) {
        // Single repo — create one draft then assign it.
        setProgress("Creating issue\u2026");
        const draftResult = await createDraftAction({ title });
        if (!draftResult.success) {
          setError(draftResult.error);
          return;
        }
        const idempotencyKey = newIdempotencyKey();
        const assignResult = await assignDraftAction(
          draftResult.id,
          selected[0],
          idempotencyKey,
        );
        if (!assignResult.success) {
          showToast("Issue creation failed \u2014 saved as draft", "warning");
          resetAndClose();
          router.push(`/drafts/${draftResult.id}`);
          return;
        }
        if (assignResult.cleanupWarning) {
          showToast(assignResult.cleanupWarning, "warning");
        } else {
          showToast(`Issue #${assignResult.issueNumber} created`, "success");
        }
        const repo = repos.find((r) => r.id === selected[0]);
        resetAndClose();
        if (repo && assignResult.issueNumber) {
          router.push(
            `/issues/${repo.owner}/${repo.name}/${assignResult.issueNumber}`,
          );
        } else {
          router.push("/");
        }
        return;
      }

      // Multiple repos — create one draft+issue per selected repo.
      let created = 0;
      let lastWarning: string | undefined;
      for (let i = 0; i < selected.length; i++) {
        setProgress(`Creating ${i + 1} of ${selected.length}\u2026`);
        const draftResult = await createDraftAction({ title });
        if (!draftResult.success) {
          setError(
            `Failed on repo ${i + 1} of ${selected.length}: ${draftResult.error}`,
          );
          return;
        }
        const idempotencyKey = newIdempotencyKey();
        const assignResult = await assignDraftAction(
          draftResult.id,
          selected[i],
          idempotencyKey,
        );
        if (!assignResult.success) {
          setError(
            `Failed on repo ${i + 1} of ${selected.length}: ${assignResult.error}`,
          );
          return;
        }
        if (assignResult.cleanupWarning) {
          lastWarning = assignResult.cleanupWarning;
        }
        created++;
      }

      if (lastWarning) {
        showToast(lastWarning, "warning");
      } else {
        showToast(`${created} issues created`, "success");
      }
      resetAndClose();
      router.push("/");
    } catch (err) {
      console.error("[CreateDraftSheet] handleSave failed", err);
      setError("Failed to save");
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const resetAndClose = () => {
    setTitle("");
    setError(null);
    setProgress(null);
    setSelectedRepoIds(new Set());
    onClose();
  };

  const handleClose = () => {
    setTitle("");
    setError(null);
    setProgress(null);
    setSelectedRepoIds(new Set());
    onClose();
  };

  const description =
    selectedRepoIds.size === 0 ? (
      <em>a local draft without a repo — assign it later</em>
    ) : selectedRepoIds.size === 1 ? (
      <em>create a GitHub issue directly</em>
    ) : (
      <em>create an issue on {selectedRepoIds.size} repos</em>
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
          style={title.length > 50 ? { fontSize: 20, lineHeight: 1.3 } : undefined}
        />

        {/* Repo chip row — toggleable multi-select */}
        {!loadingRepos && repos.length > 0 && (
          <div className={styles.repoSection}>
            <label className={styles.label}>Repos</label>
            <div className={styles.chipRow}>
              {repos.map((repo) => {
                const isSelected = selectedRepoIds.has(repo.id);
                return (
                  <button
                    key={repo.id}
                    type="button"
                    className={
                      isSelected ? styles.repoChipSelected : styles.repoChip
                    }
                    onClick={() => toggleRepo(repo.id)}
                    disabled={saving}
                    aria-pressed={isSelected}
                  >
                    {repo.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {progress && <div className={styles.progress}>{progress}</div>}
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
            {buttonLabel(selectedRepoIds.size, saving)}
          </Button>
        </div>
        <Link href="/new" className={styles.labelLink} onClick={onClose}>
          or create with labels and repo →
        </Link>
      </div>
    </Sheet>
  );
}

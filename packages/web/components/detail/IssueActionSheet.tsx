"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet, Button } from "@/components/paper";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FilterEdgeSwipe } from "@/components/list/FilterEdgeSwipe";
import { closeIssue, reassignIssueAction } from "@/lib/actions/issues";
import { listReposAction } from "@/lib/actions/drafts";
import { useToast } from "@/components/ui/ToastProvider";
import styles from "./ActionSheet.module.css";
import assignStyles from "../list/AssignSheet.module.css";

type Repo = { id: number; owner: string; name: string };

type Props = {
  owner: string;
  repo: string;
  repoId: number;
  number: number;
};

export function IssueActionSheet({ owner, repo, repoId, number }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Re-assign state
  const [reassignSheetOpen, setReassignSheetOpen] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  useEffect(() => {
    if (!reassignSheetOpen) return;
    setReassignError(null);
    setLoadingRepos(true);
    listReposAction()
      .then(setRepos)
      .catch(() => setReassignError("Failed to load repos"))
      .finally(() => setLoadingRepos(false));
  }, [reassignSheetOpen]);

  function handleCloseTap() {
    setSheetOpen(false);
    setConfirmClose(true);
  }

  function handleCloseConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await closeIssue(owner, repo, number);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setConfirmClose(false);
        showToast("Issue closed", "success");
        router.push("/?section=shipped");
      } catch {
        setError("Unable to reach the server. Check your connection and try again.");
      }
    });
  }

  function handleReassignTap() {
    setSheetOpen(false);
    setReassignSheetOpen(true);
  }

  function handleRepoSelect(targetRepo: Repo) {
    setSelectedRepo(targetRepo);
  }

  async function handleReassignConfirm() {
    if (!selectedRepo) return;
    setReassigning(true);
    setReassignError(null);
    try {
      const result = await reassignIssueAction(
        repoId,
        number,
        selectedRepo.id,
      );
      if (!result.success) {
        setReassignError(result.error);
        return;
      }
      setSelectedRepo(null);
      setReassignSheetOpen(false);
      showToast(
        `Issue moved to ${result.newOwner}/${result.newRepo}#${result.newIssueNumber}`,
        "success",
      );
      router.push(
        `/issues/${result.newOwner}/${result.newRepo}/${result.newIssueNumber}`,
      );
    } catch {
      setReassignError(
        "Unable to reach the server. Check your connection and try again.",
      );
    } finally {
      setReassigning(false);
    }
  }

  const otherRepos = repos.filter((r) => r.id !== repoId);

  return (
    <>
      <FilterEdgeSwipe
        onTrigger={() => setSheetOpen(true)}
        label="Actions"
      />

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="issue actions"
      >
        <button className={styles.item} onClick={handleReassignTap}>
          <span className={styles.icon}>&harr;</span>
          Re-assign to repo
        </button>
        <button
          className={`${styles.item} ${styles.danger}`}
          onClick={handleCloseTap}
        >
          <span className={styles.icon}>&bull;</span>
          Close issue
        </button>
      </Sheet>

      {confirmClose && (
        <ConfirmDialog
          title="Close Issue"
          message={`Close issue #${number}? This can be reopened later from GitHub.`}
          confirmLabel="Close Issue"
          onConfirm={handleCloseConfirm}
          onCancel={() => setConfirmClose(false)}
          isPending={isPending}
          error={error ?? undefined}
        />
      )}

      <Sheet
        open={reassignSheetOpen}
        onClose={() => setReassignSheetOpen(false)}
        title="re-assign to repo"
        description={
          <em>
            #{number} &mdash; currently on {owner}/{repo}
          </em>
        }
      >
        <div className={assignStyles.body}>
          {loadingRepos && (
            <div className={assignStyles.loading}>loading repos…</div>
          )}
          {reassignError && !selectedRepo && (
            <div className={assignStyles.error}>{reassignError}</div>
          )}
          {!loadingRepos && otherRepos.length === 0 && !reassignError && (
            <div className={assignStyles.empty}>
              <em>no other repos available</em>
            </div>
          )}
          {otherRepos.map((r) => (
            <button
              key={r.id}
              className={assignStyles.row}
              onClick={() => handleRepoSelect(r)}
              disabled={reassigning}
            >
              <div className={assignStyles.repoName}>{r.name}</div>
              <div className={assignStyles.repoOwner}>{r.owner}</div>
            </button>
          ))}
          <div className={assignStyles.footer}>
            <Button
              variant="ghost"
              onClick={() => setReassignSheetOpen(false)}
              disabled={reassigning}
            >
              cancel
            </Button>
          </div>
        </div>
      </Sheet>

      {selectedRepo && (
        <ConfirmDialog
          title="Re-assign Issue"
          message={`Move issue #${number} from ${owner}/${repo} to ${selectedRepo.owner}/${selectedRepo.name}? The old issue will be closed with a cross-reference.`}
          confirmLabel="Re-assign"
          confirmVariant="default"
          onConfirm={handleReassignConfirm}
          onCancel={() => {
            setSelectedRepo(null);
            setReassignError(null);
          }}
          isPending={reassigning}
          error={reassignError ?? undefined}
        />
      )}
    </>
  );
}

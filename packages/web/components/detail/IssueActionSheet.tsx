"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  GitHubIssue,
  GitHubComment,
  Deployment,
} from "@issuectl/core";
import { Sheet } from "@/components/paper";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FilterEdgeSwipe } from "@/components/list/FilterEdgeSwipe";
import { LaunchModal } from "@/components/launch/LaunchModal";
import { closeIssue } from "@/lib/actions/issues";
import { getComments } from "@/lib/actions/comments";
import { useToast } from "@/components/ui/ToastProvider";
import styles from "./ActionSheet.module.css";

type Props = {
  owner: string;
  repo: string;
  number: number;
  repoLocalPath: string | null;
  issue: GitHubIssue;
  deployments: Deployment[];
  referencedFiles: string[];
  hasLiveDeployment: boolean;
};

export function IssueActionSheet({
  owner,
  repo,
  number,
  repoLocalPath,
  issue,
  deployments,
  referencedFiles,
  hasLiveDeployment,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!launchOpen) return;
    let cancelled = false;
    getComments(owner, repo, number).then((result) => {
      if (cancelled) return;
      if (result.success) {
        setComments(result.comments);
      } else {
        console.error("[issuectl] IssueActionSheet: failed to load comments:", result.error);
      }
    });
    return () => { cancelled = true; };
  }, [launchOpen, owner, repo, number]);

  function handleLaunchTap() {
    setSheetOpen(false);
    setComments([]);
    setLaunchOpen(true);
  }

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
        router.refresh();
      } catch {
        setError("Unable to reach the server. Check your connection and try again.");
      }
    });
  }

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
        {!hasLiveDeployment && (
          <button className={styles.item} onClick={handleLaunchTap}>
            <span className={styles.icon}>&#x25B6;</span>
            Launch with Claude
          </button>
        )}
        <button
          className={`${styles.item} ${styles.danger}`}
          onClick={handleCloseTap}
        >
          <span className={styles.icon}>&bull;</span>
          Close issue
        </button>
      </Sheet>

      {launchOpen && (
        <LaunchModal
          owner={owner}
          repo={repo}
          repoLocalPath={repoLocalPath}
          issue={issue}
          comments={comments}
          deployments={deployments}
          referencedFiles={referencedFiles}
          onClose={() => setLaunchOpen(false)}
        />
      )}

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
    </>
  );
}

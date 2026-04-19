"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  GitHubIssue,
  Deployment,
} from "@issuectl/core";
import { Sheet } from "@/components/paper";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FilterEdgeSwipe } from "@/components/list/FilterEdgeSwipe";
import { LaunchModal } from "@/components/launch/LaunchModal";
import { closeIssue } from "@/lib/actions/issues";
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLaunchTap() {
    setSheetOpen(false);
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
          comments={[]}
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

"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  GitHubIssue,
  GitHubComment,
  Deployment,
} from "@issuectl/core";
import { Sheet, Button } from "@/components/paper";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FilterEdgeSwipe } from "@/components/list/FilterEdgeSwipe";
import { LaunchModal } from "@/components/launch/LaunchModal";
import { closeIssue, reassignIssueAction } from "@/lib/actions/issues";
import { endSession } from "@/lib/actions/launch";
import { getComments } from "@/lib/actions/comments";
import { listReposAction } from "@/lib/actions/drafts";
import { useToast } from "@/components/ui/ToastProvider";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { useOfflineAware } from "@/hooks/useOfflineAware";
import { useStaleTab } from "@/hooks/useStaleTab";
import styles from "./ActionSheet.module.css";
import assignStyles from "../list/AssignSheet.module.css";

type Repo = { id: number; owner: string; name: string };

type Props = {
  owner: string;
  repo: string;
  repoId: number;
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
  repoId,
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

  // Re-assign state
  const [reassignSheetOpen, setReassignSheetOpen] = useState(false);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignKey, setReassignKey] = useState<string | null>(null);

  const { isOffline } = useOfflineAware();

  useStaleTab();

  useEffect(() => {
    if (!launchOpen) return;
    let cancelled = false;
    getComments(owner, repo, number)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setComments(result.comments);
        } else {
          console.error("[issuectl] IssueActionSheet: failed to load comments:", result.error);
          showToast("Could not load comments for context selection", "warning");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[issuectl] IssueActionSheet: comment fetch failed:", err);
        showToast("Could not load comments for context selection", "warning");
      });
    return () => { cancelled = true; };
  }, [launchOpen, owner, repo, number, showToast]);

  useEffect(() => {
    if (!reassignSheetOpen) return;
    setReassignError(null);
    setLoadingRepos(true);
    listReposAction()
      .then(setRepos)
      .catch((err) => {
        console.error("[issuectl] Failed to load repos for reassign:", err);
        setReassignError("Failed to load repos");
      })
      .finally(() => setLoadingRepos(false));
  }, [reassignSheetOpen]);

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
        // End active terminal session before closing the issue
        const liveDeployment = deployments.find((d) => d.endedAt === null);
        if (liveDeployment) {
          const endResult = await endSession(liveDeployment.id, owner, repo, number);
          if (!endResult.success) {
            console.warn(
              "[issuectl] Failed to end session while closing issue:",
              endResult.error,
            );
            showToast(
              "Terminal session could not be stopped cleanly — it will be cleaned up on next restart.",
              "warning",
            );
          }
        }
        const result = await closeIssue(owner, repo, number);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setConfirmClose(false);
        showToast(
          result.cacheStale
            ? "Issue closed — reload if the list looks stale"
            : "Issue closed",
          "success",
        );
        router.replace("/?section=shipped");
      } catch (err) {
        console.error("[issuectl] Close issue failed:", err);
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
    // Generate idempotency key once per intent so retries reuse
    // the same key and don't create duplicate issues.
    setReassignKey(newIdempotencyKey());
  }

  async function handleReassignConfirm() {
    if (!selectedRepo || !reassignKey) return;
    setReassigning(true);
    setReassignError(null);
    try {
      const result = await reassignIssueAction(
        repoId,
        number,
        selectedRepo.id,
        reassignKey,
      );
      if (!result.success) {
        setReassignError(result.error);
        return;
      }
      setSelectedRepo(null);
      setReassignSheetOpen(false);
      if (result.cleanupWarning) {
        const suffix = result.cacheStale ? " Reload if the list looks stale." : "";
        showToast(`${result.cleanupWarning}${suffix}`, "warning");
      } else {
        const msg = `Issue moved to ${result.newOwner}/${result.newRepo}#${result.newIssueNumber}`;
        showToast(
          result.cacheStale ? `${msg} — reload if the list looks stale` : msg,
          "success",
        );
      }
      router.push(
        `/issues/${result.newOwner}/${result.newRepo}/${result.newIssueNumber}`,
      );
    } catch (err) {
      console.error("[issuectl] Reassign issue failed:", err);
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

      {/* Desktop inline action bar — visible only on wide viewports */}
      <div className={styles.desktopBar}>
        {!hasLiveDeployment && (
          <Button variant="primary" onClick={handleLaunchTap}>
            Launch with Claude
          </Button>
        )}
        <Button variant="ghost" onClick={handleReassignTap}>
          Re-assign
        </Button>
        <Button variant="ghost" onClick={handleCloseTap}>
          Close issue
        </Button>
      </div>

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
          className={`${styles.item} ${isOffline ? styles.disabled : ""}`}
          onClick={isOffline ? undefined : handleReassignTap}
          disabled={isOffline}
        >
          <span className={styles.icon}>&harr;</span>
          Re-assign to repo
          {isOffline && <span className={styles.offlineHint}>Requires connection</span>}
        </button>
        <button
          className={`${styles.item} ${styles.danger} ${isOffline ? styles.disabled : ""}`}
          onClick={isOffline ? undefined : handleCloseTap}
          disabled={isOffline}
        >
          <span className={styles.icon}>&bull;</span>
          Close issue
          {isOffline && <span className={styles.offlineHint}>Requires connection</span>}
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

"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GitHubIssue, GitHubComment, Deployment } from "@issuectl/core";
import type { LaunchAgent } from "@/components/launch/agent";
import { CloseIssueModal } from "@/components/ui/CloseIssueModal";
import { BottomHandle } from "@/components/list/BottomHandle";
import { LaunchModal } from "@/components/launch/LaunchModal";
import { IssueActionsMenu } from "./IssueActionsMenu";
import { IssueDesktopActions } from "./IssueDesktopActions";
import { IssueReassignSheet } from "./IssueReassignSheet";
import { AutoLaunchTrigger } from "./AutoLaunchTrigger";
import { closeIssue, reassignIssueAction } from "@/lib/actions/issues";
import { endSession } from "@/lib/actions/launch";
import { getComments } from "@/lib/actions/comments";
import { listReposAction } from "@/lib/actions/drafts";
import { useToast } from "@/components/ui/ToastProvider";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { tryOrQueue } from "@/lib/tryOrQueue";
import { useOfflineAware } from "@/hooks/useOfflineAware";
import { useStaleTab } from "@/hooks/useStaleTab";

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
  defaultAgent: LaunchAgent;
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
  defaultAgent,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  function handleCloseConfirm(comment: string) {
    setError(null);
    startTransition(async () => {
      try {
        const liveDeployment = deployments.find((d) => d.endedAt === null);
        if (liveDeployment && !isOffline) {
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
        const result = await tryOrQueue(
          "closeIssue",
          { owner, repo, issueNumber: number, comment: comment || undefined },
          () => closeIssue(owner, repo, number, comment || undefined),
        );
        if (result.outcome === "queued") {
          setConfirmClose(false);
          showToast("Issue close queued — will sync when online", "warning");
          router.replace("/?section=closed");
          return;
        }
        if (result.outcome === "error") {
          setError(result.error);
          return;
        }
        setConfirmClose(false);
        const data = result.data as { cacheStale?: boolean };
        showToast(
          data.cacheStale
            ? "Issue closed — reload if the list looks stale"
            : "Issue closed",
          "success",
        );
        router.replace("/?section=closed");
      } catch (err) {
        console.error("[issuectl] Close issue failed:", err);
        setError("Something went wrong while closing the issue. Please try again.");
      }
    });
  }

  function handleReassignTap() {
    setSheetOpen(false);
    setReassignSheetOpen(true);
  }

  function handleRepoSelect(targetRepo: Repo) {
    setSelectedRepo(targetRepo);
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

  return (
    <>
      <BottomHandle onTrigger={() => setSheetOpen(true)} label="Actions" />

      <IssueDesktopActions
        hasLiveDeployment={hasLiveDeployment}
        defaultAgent={defaultAgent}
        onLaunch={handleLaunchTap}
        onReassign={handleReassignTap}
        onCloseIssue={handleCloseTap}
      />

      <Suspense fallback={null}>
        <AutoLaunchTrigger
          hasLiveDeployment={hasLiveDeployment}
          onTrigger={handleLaunchTap}
        />
      </Suspense>

      <IssueActionsMenu
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        hasLiveDeployment={hasLiveDeployment}
        defaultAgent={defaultAgent}
        isOffline={isOffline}
        onLaunch={handleLaunchTap}
        onReassign={handleReassignTap}
        onCloseIssue={handleCloseTap}
      />

      {launchOpen && (
        <LaunchModal
          owner={owner}
          repo={repo}
          repoLocalPath={repoLocalPath}
          issue={issue}
          comments={comments}
          deployments={deployments}
          referencedFiles={referencedFiles}
          initialAgent={defaultAgent}
          onClose={() => setLaunchOpen(false)}
        />
      )}

      {confirmClose && (
        <CloseIssueModal
          issueNumber={number}
          onConfirm={handleCloseConfirm}
          onCancel={() => setConfirmClose(false)}
          isPending={isPending}
          error={error ?? undefined}
        />
      )}

      <IssueReassignSheet
        open={reassignSheetOpen}
        onClose={() => setReassignSheetOpen(false)}
        owner={owner}
        repo={repo}
        repoId={repoId}
        number={number}
        repos={repos}
        loadingRepos={loadingRepos}
        selectedRepo={selectedRepo}
        reassigning={reassigning}
        reassignError={reassignError}
        onSelectRepo={handleRepoSelect}
        onConfirm={handleReassignConfirm}
        onCancelSelection={() => {
          setSelectedRepo(null);
          setReassignError(null);
        }}
      />
    </>
  );
}

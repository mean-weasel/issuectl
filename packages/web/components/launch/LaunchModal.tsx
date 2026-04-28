"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  GitHubIssue,
  GitHubComment,
  Deployment,
  WorkspaceMode,
} from "@issuectl/core";
import { generateBranchName } from "@/lib/branch";
import { launchIssue } from "@/lib/actions/launch";
import { DEFAULT_BRANCH_PATTERN } from "@/lib/constants";
import { Button } from "@/components/paper";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { checkWorktreeStatusAction } from "@/lib/actions/worktrees";
import { BranchInput } from "./BranchInput";
import { WorkspaceModeSelector } from "./WorkspaceModeSelector";
import { ContextToggles } from "./ContextToggles";
import { PreambleInput } from "./PreambleInput";
import { DirtyWorktreeBanner } from "./DirtyWorktreeBanner";
import styles from "./LaunchModal.module.css";

type Props = {
  owner: string;
  repo: string;
  repoLocalPath: string | null;
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  referencedFiles: string[];
  initialWorkspaceMode?: WorkspaceMode;
  onClose: () => void;
};

export function LaunchModal({
  owner,
  repo,
  repoLocalPath,
  issue,
  comments,
  deployments,
  referencedFiles,
  initialWorkspaceMode,
  onClose,
}: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const lastDeployment = deployments[0];
  const defaultBranch =
    lastDeployment?.branchName ??
    generateBranchName(DEFAULT_BRANCH_PATTERN, issue.number, issue.title);

  const [branchName, setBranchName] = useState(defaultBranch);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
    initialWorkspaceMode ?? (repoLocalPath ? "worktree" : "clone"),
  );
  const [selectedComments, setSelectedComments] = useState<number[]>(
    comments.map((_, i) => i),
  );
  const [selectedFiles, setSelectedFiles] = useState<string[]>(
    referencedFiles,
  );
  const [preamble, setPreamble] = useState("");
  const [dirtyWorktree, setDirtyWorktree] = useState<{
    dirty: boolean;
    path: string;
  } | null>(null);
  const [forceResume, setForceResume] = useState(false);

  const [initialBranch] = useState(defaultBranch);
  const [initialMode] = useState<WorkspaceMode>(
    initialWorkspaceMode ?? (repoLocalPath ? "worktree" : "clone"),
  );

  // Auto-select all comments when they arrive via lazy-fetch (initially empty).
  useEffect(() => {
    if (comments.length > 0) {
      setSelectedComments(comments.map((_, i) => i));
    }
  }, [comments]);

  useEffect(() => {
    setForceResume(false);
    if (workspaceMode !== "worktree" && workspaceMode !== "clone") {
      setDirtyWorktree(null);
      return;
    }

    let cancelled = false;
    checkWorktreeStatusAction(owner, repo, issue.number)
      .then((status) => {
        if (cancelled) return;
        if (status.exists && status.dirty) {
          setDirtyWorktree({ dirty: true, path: status.path });
        } else {
          setDirtyWorktree(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[issuectl] Pre-flight worktree check failed:", err);
      });

    return () => { cancelled = true; };
  }, [owner, repo, issue.number, workspaceMode]);

  const isDirty =
    branchName !== initialBranch ||
    workspaceMode !== initialMode ||
    preamble.trim().length > 0 ||
    selectedComments.length !== comments.length ||
    selectedFiles.length !== referencedFiles.length ||
    selectedFiles.some((f) => !referencedFiles.includes(f));

  const toggleComment = useCallback((index: number) => {
    setSelectedComments((prev) =>
      prev.includes(index)
        ? prev.filter((i) => i !== index)
        : [...prev, index],
    );
  }, []);

  const toggleFile = useCallback((path: string) => {
    setSelectedFiles((prev) =>
      prev.includes(path)
        ? prev.filter((p) => p !== path)
        : [...prev, path],
    );
  }, []);

  const addFile = useCallback((path: string) => {
    setSelectedFiles((prev) => [...prev, path]);
  }, []);

  const handleClose = useCallback(() => {
    if (isPending) return;
    if (isDirty && !window.confirm("Discard launch configuration?")) return;
    onClose();
  }, [isPending, isDirty, onClose]);

  function handleLaunch() {
    setError(null);
    const idempotencyKey = newIdempotencyKey();
    startTransition(async () => {
      try {
        const result = await launchIssue({
          owner,
          repo,
          issueNumber: issue.number,
          branchName: branchName.trim(),
          workspaceMode,
          selectedCommentIndices: selectedComments,
          selectedFilePaths: selectedFiles,
          preamble: preamble.trim() || undefined,
          idempotencyKey,
          forceResume,
        });

        if (!result.success) {
          setError(result.error ?? "Launch failed");
          return;
        }

        const deploymentId = result.deploymentId;
        if (!deploymentId) {
          setError("Launch succeeded but deployment ID was not returned");
          return;
        }

        if (result.labelWarning) {
          showToast(result.labelWarning, "warning");
        }

        const c = selectedComments.length;
        const f = selectedFiles.length;
        router.push(
          `/launch/${owner}/${repo}/${issue.number}?deploymentId=${deploymentId}&c=${c}&f=${f}`,
        );
      } catch (err) {
        console.error("[issuectl] Launch failed:", err);
        setError(
          err instanceof Error ? err.message : "Launch failed \u2014 check your connection",
        );
      }
    });
  }

  return (
    <Modal
      title="Launch to Claude Code"
      width={620}
      onClose={handleClose}
      disabled={isPending}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={handleLaunch}
            disabled={isPending || !branchName.trim()}
          >
            {isPending
              ? workspaceMode === "clone"
                ? "Cloning repo & launching\u2026"
                : workspaceMode === "worktree"
                  ? "Preparing worktree & launching\u2026"
                  : "Launching\u2026"
              : "Launch"}
          </Button>
        </>
      }
    >
      <div className={styles.issueSummary}>
        <span className={styles.issueDot} />
        <div>
          <div className={styles.issueTitle}>
            #{issue.number} &middot; {issue.title}
          </div>
          <div className={styles.issueRepo}>
            {owner}/{repo}
          </div>
        </div>
      </div>

      {dirtyWorktree?.dirty && !forceResume && (
        <DirtyWorktreeBanner
          owner={owner}
          repo={repo}
          issueNumber={issue.number}
          worktreePath={dirtyWorktree.path}
          onDiscard={() => setDirtyWorktree(null)}
          onResume={() => setForceResume(true)}
        />
      )}

      <BranchInput value={branchName} onChange={setBranchName} />

      <WorkspaceModeSelector
        value={workspaceMode}
        onChange={setWorkspaceMode}
        repoLocalPath={repoLocalPath}
        repo={repo}
        issueNumber={issue.number}
      />

      <ContextToggles
        comments={comments}
        referencedFiles={referencedFiles}
        selectedComments={selectedComments}
        selectedFiles={selectedFiles}
        onToggleComment={toggleComment}
        onToggleFile={toggleFile}
        onAddFile={addFile}
      />

      <PreambleInput value={preamble} onChange={setPreamble} />

      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </Modal>
  );
}

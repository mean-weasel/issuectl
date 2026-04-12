"use client";

import { useState, useTransition, useCallback } from "react";
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
import { useToast } from "@/components/ui/ToastProvider";
import { newIdempotencyKey } from "@/lib/idempotency-key";
import { BranchInput } from "./BranchInput";
import { WorkspaceModeSelector } from "./WorkspaceModeSelector";
import { ContextToggles } from "./ContextToggles";
import { PreambleInput } from "./PreambleInput";
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
    initialWorkspaceMode ?? (repoLocalPath ? "existing" : "clone"),
  );
  const [selectedComments, setSelectedComments] = useState<number[]>(
    comments.map((_, i) => i),
  );
  const [selectedFiles, setSelectedFiles] = useState<string[]>(
    referencedFiles,
  );
  const [preamble, setPreamble] = useState("");

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

  function handleLaunch() {
    setError(null);
    const idempotencyKey = newIdempotencyKey();
    startTransition(async () => {
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

      router.push(
        `/launch/${owner}/${repo}/${issue.number}?deploymentId=${deploymentId}`,
      );
    });
  }

  return (
    <div className={styles.overlay} onClick={isPending ? undefined : onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>Launch to Claude Code</span>
          <button className={styles.close} onClick={isPending ? undefined : onClose} disabled={isPending}>
            &times;
          </button>
        </div>

        <div className={styles.body}>
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
          />

          <PreambleInput value={preamble} onChange={setPreamble} />

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={handleLaunch}
            disabled={isPending || !branchName.trim()}
          >
            {isPending
              ? workspaceMode === "clone"
                ? "Cloning repo & launching…"
                : workspaceMode === "worktree"
                  ? "Preparing worktree & launching…"
                  : "Launching…"
              : "Launch"}
          </Button>
        </div>
      </div>
    </div>
  );
}

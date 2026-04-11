"use client";

import { useState } from "react";
import type {
  GitHubIssue,
  GitHubComment,
  Deployment,
  WorkspaceMode,
} from "@issuectl/core";
import { Button } from "@/components/paper";
import { LaunchModal } from "@/components/launch/LaunchModal";
import styles from "./LaunchCardPlaceholder.module.css";

type Props = {
  owner: string;
  repo: string;
  repoLocalPath: string | null;
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  referencedFiles: string[];
  initialWorkspaceMode?: WorkspaceMode;
};

export function LaunchCard({
  owner,
  repo,
  repoLocalPath,
  issue,
  comments,
  deployments,
  referencedFiles,
  initialWorkspaceMode,
}: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className={styles.card}>
        <h4>Ready to launch</h4>
        <p>
          Open a Ghostty session with Claude Code pre-loaded. Creates a worktree
          on a fresh branch.
        </p>
        <div className={styles.actions}>
          <Button variant="accent" onClick={() => setModalOpen(true)}>
            launch →
          </Button>
          <Button variant="ghost" onClick={() => setModalOpen(true)}>
            configure
          </Button>
        </div>
      </div>
      {modalOpen && (
        <LaunchModal
          owner={owner}
          repo={repo}
          repoLocalPath={repoLocalPath}
          issue={issue}
          comments={comments}
          deployments={deployments}
          referencedFiles={referencedFiles}
          initialWorkspaceMode={initialWorkspaceMode}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

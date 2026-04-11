"use client";

import { useState } from "react";
import type {
  GitHubIssue,
  GitHubComment,
  Deployment,
} from "@issuectl/core";
import { Button } from "@/components/paper";
import { LaunchModal } from "./LaunchModal";
import { ClonePromptModal } from "./ClonePromptModal";

type Props = {
  owner: string;
  repo: string;
  repoLocalPath: string | null;
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  referencedFiles: string[];
  className?: string;
};

export function LaunchButton({
  owner,
  repo,
  repoLocalPath,
  issue,
  comments,
  deployments,
  referencedFiles,
  className,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [showClonePrompt, setShowClonePrompt] = useState(false);
  const [forceCloneMode, setForceCloneMode] = useState(false);

  const hasLaunched = deployments.length > 0;

  function handleClick() {
    if (!repoLocalPath) {
      setShowClonePrompt(true);
    } else {
      setForceCloneMode(false);
      setShowModal(true);
    }
  }

  function handleCloneConfirm() {
    setShowClonePrompt(false);
    setForceCloneMode(true);
    setShowModal(true);
  }

  return (
    <>
      <Button variant="accent" className={className} onClick={handleClick}>
        {hasLaunched ? "Re-launch" : "Launch to Claude Code"}
      </Button>

      {showClonePrompt && (
        <ClonePromptModal
          owner={owner}
          repo={repo}
          onConfirm={handleCloneConfirm}
          onClose={() => setShowClonePrompt(false)}
        />
      )}

      {showModal && (
        <LaunchModal
          owner={owner}
          repo={repo}
          repoLocalPath={repoLocalPath}
          issue={issue}
          comments={comments}
          deployments={deployments}
          referencedFiles={referencedFiles}
          initialWorkspaceMode={forceCloneMode ? "clone" : undefined}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

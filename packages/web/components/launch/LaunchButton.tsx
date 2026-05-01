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
import { launchAgentLabel, normalizeLaunchAgent, type LaunchAgent } from "./agent";

type Props = {
  owner: string;
  repo: string;
  repoLocalPath: string | null;
  issue: GitHubIssue;
  comments: GitHubComment[];
  deployments: Deployment[];
  referencedFiles: string[];
  defaultAgent?: LaunchAgent;
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
  defaultAgent = "claude",
  className,
}: Props) {
  const [showModal, setShowModal] = useState(false);
  const [showClonePrompt, setShowClonePrompt] = useState(false);
  const [forceCloneMode, setForceCloneMode] = useState(false);

  const hasLaunched = deployments.length > 0;
  const initialAgent = normalizeLaunchAgent(defaultAgent);

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
        {hasLaunched ? `Re-launch with ${launchAgentLabel(initialAgent)}` : `Launch to ${launchAgentLabel(initialAgent)}`}
      </Button>

      {showClonePrompt && (
        <ClonePromptModal
          owner={owner}
          repo={repo}
          agent={initialAgent}
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
          initialAgent={initialAgent}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

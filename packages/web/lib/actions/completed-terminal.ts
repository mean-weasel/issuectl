"use server";

import { execFileSync } from "node:child_process";
import {
  formatErrorForUser,
  getDb,
  getDeploymentById,
  getRepo,
  isTmuxSessionAlive,
} from "@issuectl/core";
import { deploymentSessionName, getDeploymentTarget } from "@/lib/deployment-target";

type CompletedSessionTranscriptResponse =
  | { success: true; sessionName: string; transcript: string }
  | { success: false; error: string; unavailable?: true };

export async function getCompletedSessionTranscript(input: {
  deploymentId: number;
  owner: string;
  repo: string;
  targetType: "issue" | "pr";
  targetNumber: number;
}): Promise<CompletedSessionTranscriptResponse> {
  const error = validateTranscriptInput(input);
  if (error) return { success: false, error };

  try {
    const db = getDb();
    const deployment = getDeploymentById(db, input.deploymentId);
    if (!deployment) return { success: false, error: "Deployment not found" };

    const repoRecord = getRepo(db, input.owner, input.repo);
    if (!repoRecord) return { success: false, error: "Repository not found" };
    if (deployment.repoId !== repoRecord.id) {
      return { success: false, error: "Deployment does not match this repository" };
    }

    const target = getDeploymentTarget(deployment);
    if (target.targetType !== input.targetType || target.targetNumber !== input.targetNumber) {
      return { success: false, error: "Deployment does not match this target" };
    }
    if (deployment.endedAt === null) {
      return { success: false, error: "Session is still active. Open the live terminal instead." };
    }

    const sessionName = deploymentSessionName(input.repo, deployment);
    if (!isTmuxSessionAlive(sessionName)) {
      return {
        success: false,
        unavailable: true,
        error: "Completed terminal is no longer available on this machine.",
      };
    }

    return {
      success: true,
      sessionName,
      transcript: captureCompletedPane(sessionName),
    };
  } catch (err) {
    console.error("[issuectl] Failed to load completed session transcript:", err);
    return { success: false, error: formatErrorForUser(err) };
  }
}

function validateTranscriptInput(input: {
  deploymentId: number;
  owner: string;
  repo: string;
  targetType: "issue" | "pr";
  targetNumber: number;
}): string | null {
  if (!Number.isInteger(input.deploymentId) || input.deploymentId <= 0) return "Invalid deployment ID";
  if (!input.owner || !input.repo) return "Invalid repository reference";
  if (input.targetType !== "issue" && input.targetType !== "pr") return "Invalid target type";
  if (!Number.isInteger(input.targetNumber) || input.targetNumber <= 0) return "Invalid target number";
  return null;
}

function captureCompletedPane(sessionName: string): string {
  const transcript = execFileSync(
    "tmux",
    ["capture-pane", "-p", "-t", sessionName, "-S", "-240"],
    { encoding: "utf8", maxBuffer: 512 * 1024 },
  ).trimEnd();
  return transcript || "(terminal pane is empty)";
}

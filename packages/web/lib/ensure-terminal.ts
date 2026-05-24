import {
  endDeployment,
  getDb,
  getDeploymentById,
  getRepoById,
  isTmuxSessionAlive,
  recordDiagnosticEventSafely,
} from "@issuectl/core";
import { deploymentSessionName, issueNumberForDiagnostic } from "./deployment-target";
import { ensureTtydForDeployment, type EnsureTtydResult } from "./ensure-ttyd";
import { createPtyTerminalToken } from "./terminal-auth";

type TerminalBackend = "ttyd" | "pty_bridge";
type DeploymentWithTerminalBackend = ReturnType<typeof getDeploymentById> & {
  terminalBackend?: TerminalBackend;
};

export type EnsureTerminalResult =
  | ({ backend: "ttyd" } & Extract<EnsureTtydResult, { port: number }>)
  | { backend: "pty_bridge"; deploymentId: number; terminalToken: string; wsUrl: string }
  | { alive: false; error?: string; backend?: TerminalBackend };

export async function ensureTerminalForDeployment(
  deploymentId: number,
): Promise<EnsureTerminalResult> {
  if (!Number.isInteger(deploymentId) || deploymentId <= 0) {
    return { alive: false, error: "Invalid deployment ID" };
  }

  let db: ReturnType<typeof getDb> | null = null;
  let deployment: DeploymentWithTerminalBackend | null = null;
  try {
    db = getDb();
    deployment = getDeploymentById(db, deploymentId) as DeploymentWithTerminalBackend;
  } catch {
    // Let the existing ttyd ensure path keep its current error handling.
  }

  if (db && deployment?.terminalBackend === "pty_bridge") {
    return ensurePtyBridgeTerminal(db, deploymentId, deployment);
  }

  const result = await ensureTtydForDeployment(deploymentId);
  if ("port" in result) {
    return { backend: "ttyd", ...result };
  }
  return result;
}

function ensurePtyBridgeTerminal(
  db: ReturnType<typeof getDb>,
  deploymentId: number,
  deployment: NonNullable<DeploymentWithTerminalBackend>,
): EnsureTerminalResult {
  try {
    const repo = getRepoById(db, deployment.repoId);
    if (!repo) {
      recordDiagnosticEventSafely(db, {
        level: "error",
        event: "pty.ensure_failed",
        source: "web.ensure-terminal",
        issueNumber: issueNumberForDiagnostic(deployment),
        deploymentId,
        message: "Repository not found",
      });
      return { alive: false, backend: "pty_bridge", error: "Repository not found" };
    }

    const sessionName = deploymentSessionName(repo.name, deployment);
    if (!isTmuxSessionAlive(sessionName)) {
      try {
        endDeployment(db, deploymentId);
      } catch {
        // The UI still needs a stale-session response if another request already ended the row.
      }
      recordDiagnosticEventSafely(db, {
        level: "warn",
        event: "pty.tmux_missing",
        source: "web.ensure-terminal",
        owner: repo.owner,
        repo: repo.name,
        issueNumber: issueNumberForDiagnostic(deployment),
        deploymentId,
        sessionName,
        message: "Terminal session has ended",
      });
      return { alive: false, backend: "pty_bridge", error: "Terminal session has ended" };
    }

    const terminalToken = createPtyTerminalToken(deploymentId);
    if (terminalToken) {
      return {
        backend: "pty_bridge",
        deploymentId,
        terminalToken,
        wsUrl: `/api/terminal/pty/${deploymentId}/ws?terminalToken=${encodeURIComponent(terminalToken)}`,
      };
    }

    return {
      alive: false,
      backend: "pty_bridge",
      error: "PTY terminal auth token could not be created",
    };
  } catch {
    return {
      alive: false,
      backend: "pty_bridge",
      error: "PTY terminal could not be prepared",
    };
  }
}

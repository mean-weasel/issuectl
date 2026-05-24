import {
  getDb,
  getRepoById,
  getDeploymentById,
  endDeployment,
  isTtydAlive,
  isTmuxSessionAlive,
  respawnTtyd,
  updateTtydInfo,
  formatErrorForUser,
  recordDiagnosticEventSafely,
} from "@issuectl/core";
import { deploymentSessionName, issueNumberForDiagnostic } from "./deployment-target";
import { createTerminalToken } from "./terminal-auth";
import { recordTerminalEventForDeployment } from "./terminal-diagnostics";

export type EnsureTtydResult =
  | { port: number; terminalToken: string; respawned?: true; alive?: never; error?: never }
  | { alive: false; error?: string; port?: never };

const ensureTtydInFlight = new Map<number, Promise<EnsureTtydResult>>();

export async function ensureTtydForDeployment(
  deploymentId: number,
): Promise<EnsureTtydResult> {
  if (!Number.isInteger(deploymentId) || deploymentId <= 0) {
    return { alive: false, error: "Invalid deployment ID" };
  }

  const pending = ensureTtydInFlight.get(deploymentId);
  if (pending) {
    return pending;
  }

  const promise = runEnsureTtydForDeployment(deploymentId);
  ensureTtydInFlight.set(deploymentId, promise);
  try {
    return await promise;
  } finally {
    ensureTtydInFlight.delete(deploymentId);
  }
}

async function runEnsureTtydForDeployment(
  deploymentId: number,
): Promise<EnsureTtydResult> {
  let db: ReturnType<typeof getDb> | undefined;
  try {
    db = getDb();
    const deployment = getDeploymentById(db, deploymentId);
    if (!deployment || deployment.endedAt !== null) {
      recordDiagnosticEventSafely(db, {
        level: "error",
        event: "ensure_ttyd.failed",
        source: "web.ensure-ttyd",
        deploymentId,
        message: "Deployment not found or already ended",
      });
      return { alive: false, error: "Deployment not found or already ended" };
    }
    if (!deployment.ttydPid || deployment.ttydPort === null) {
      recordDiagnosticEventSafely(db, {
        level: "error",
        event: "ensure_ttyd.failed",
        source: "web.ensure-ttyd",
        issueNumber: issueNumberForDiagnostic(deployment),
        deploymentId,
        message: "No terminal process configured",
      });
      return { alive: false, error: "No terminal process configured" };
    }
    const port = deployment.ttydPort;
    recordTerminalEventForDeployment(db, deployment, {
      level: "info",
      event: "terminal.open_requested",
      source: "web.ensure-ttyd",
    });

    if (isTtydAlive(deployment.ttydPid)) {
      recordDiagnosticEventSafely(db, {
        level: "info",
        event: "ensure_ttyd.alive",
        source: "web.ensure-ttyd",
        issueNumber: issueNumberForDiagnostic(deployment),
        deploymentId,
        ttydPort: port,
        ttydPid: deployment.ttydPid,
      });
      const terminalToken = createTerminalToken(deploymentId, port);
      if (!terminalToken) {
        recordTerminalEventForDeployment(db, deployment, {
          level: "error",
          event: "terminal.token_failed",
          source: "web.ensure-ttyd",
          message: "Terminal auth token could not be created",
        });
        recordDiagnosticEventSafely(db, {
          level: "error",
          event: "ensure_ttyd.failed",
          source: "web.ensure-ttyd",
          issueNumber: issueNumberForDiagnostic(deployment),
          deploymentId,
          ttydPort: port,
          ttydPid: deployment.ttydPid,
          message: "Terminal auth token could not be created",
        });
        return { alive: false, error: "Terminal auth token could not be created" };
      }
      recordTerminalEventForDeployment(db, deployment, {
        level: "info",
        event: "terminal.token_issued",
        source: "web.ensure-ttyd",
      });
      return { port, terminalToken };
    }

    const repo = getRepoById(db, deployment.repoId);
    if (!repo) {
      recordDiagnosticEventSafely(db, {
        level: "error",
        event: "ensure_ttyd.failed",
        source: "web.ensure-ttyd",
        issueNumber: issueNumberForDiagnostic(deployment),
        deploymentId,
        message: "Repository not found",
      });
      return { alive: false, error: "Repository not found" };
    }

    const sessionName = deploymentSessionName(repo.name, deployment);
    if (!isTmuxSessionAlive(sessionName)) {
      endDeployment(db, deploymentId);
      recordTerminalEventForDeployment(db, deployment, {
        level: "warn",
        event: "terminal.tmux_missing",
        source: "web.ensure-ttyd",
        message: "Terminal session has ended",
      }, repo);
      recordDiagnosticEventSafely(db, {
        level: "error",
        event: "ensure_ttyd.failed",
        source: "web.ensure-ttyd",
        owner: repo.owner,
        repo: repo.name,
        issueNumber: issueNumberForDiagnostic(deployment),
        deploymentId,
        sessionName,
        message: "Terminal session has ended",
      });
      return { alive: false, error: "Terminal session has ended" };
    }

    const { pid } = await respawnTtyd(port, sessionName);
    updateTtydInfo(db, deploymentId, port, pid);
    const respawnedDeployment = { ...deployment, ttydPid: pid };
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: "ensure_ttyd.respawned",
      source: "web.ensure-ttyd",
      owner: repo.owner,
      repo: repo.name,
      issueNumber: issueNumberForDiagnostic(deployment),
      deploymentId,
      sessionName,
      ttydPort: port,
      ttydPid: pid,
    });
    recordTerminalEventForDeployment(db, respawnedDeployment, {
      level: "info",
      event: "terminal.respawned",
      source: "web.ensure-ttyd",
      data: { oldPid: deployment.ttydPid, newPid: pid },
    }, repo);
    const terminalToken = createTerminalToken(deploymentId, port);
    if (!terminalToken) {
      recordTerminalEventForDeployment(db, respawnedDeployment, {
        level: "error",
        event: "terminal.token_failed",
        source: "web.ensure-ttyd",
        message: "Terminal auth token could not be created",
      }, repo);
      recordDiagnosticEventSafely(db, {
        level: "error",
        event: "ensure_ttyd.failed",
        source: "web.ensure-ttyd",
        owner: repo.owner,
        repo: repo.name,
        issueNumber: issueNumberForDiagnostic(deployment),
        deploymentId,
        sessionName,
        ttydPort: port,
        ttydPid: pid,
        message: "Terminal auth token could not be created",
      });
      return { alive: false, error: "Terminal auth token could not be created" };
    }
    recordTerminalEventForDeployment(db, respawnedDeployment, {
      level: "info",
      event: "terminal.token_issued",
      source: "web.ensure-ttyd",
    }, repo);
    return { port, terminalToken, respawned: true };
  } catch (err) {
    console.error("[issuectl] ensureTtydForDeployment failed:", deploymentId, err);
    if (db) {
      recordDiagnosticEventSafely(db, {
        level: "error",
        event: "ensure_ttyd.failed",
        source: "web.ensure-ttyd",
        deploymentId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    return { alive: false, error: formatErrorForUser(err) };
  }
}

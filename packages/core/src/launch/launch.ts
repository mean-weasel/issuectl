import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { getSetting } from "../db/settings.js";
import {
  recordDeployment,
  deletePendingDeployment,
  reserveTtydPort,
  updateTtydInfo,
} from "../db/deployments.js";
import { writeContextFile } from "./context.js";
import type { WorkspaceMode } from "./workspace.js";
import { verifyTtyd, verifyTmux, spawnTtyd, spawnPtyBridgeSession, allocatePort, tmuxSessionName } from "./ttyd.js";
import type { DeploymentTargetType, DeploymentTriggeredBy, LaunchAgent, TerminalBackend } from "../types.js";
import {
  buildLaunchAgentCommand,
  extraArgsSettingForAgent,
  getLaunchAgent,
  normalizeLaunchAgent,
} from "./launch-agent-command.js";
import {
  createLaunchCorrelationId,
  recordDeploymentRecorded,
  recordLaunchRequested,
  recordLaunchSpawnFailed,
  recordPtyBridgeSpawned,
  recordTtydSpawned,
  recordWorkspacePrepared,
} from "./launch-diagnostics.js";
import {
  duplicateLaunchError,
  prepareLaunchWorkspace,
} from "./launch-workspace-setup.js";
import {
  buildAgentEnvironment,
  buildIssueLaunchContext,
  buildPrLaunchContext,
  seedAgentActionBudgets,
} from "./launch-contexts.js";
import { applyLaunchLifecycleLabels } from "./launch-labels.js";
import { activateRecordedDeployment } from "./launch-activation.js";

export interface LaunchOptions {
  owner: string;
  repo: string;
  issueNumber?: number;
  targetType?: DeploymentTargetType;
  targetNumber?: number;
  agent?: LaunchAgent;
  branchName: string;
  workspaceMode: WorkspaceMode;
  selectedComments: number[];
  selectedFiles: string[];
  preamble?: string;
  forceResume?: boolean;
  terminalBackend?: TerminalBackend;
  triggeredBy?: DeploymentTriggeredBy;
  completionToken?: string | null;
  reviewedFromSha?: string | null;
  reviewedToSha?: string | null;
  correlationId?: string;
}

export interface LaunchResult {
  deploymentId: number;
  branchName: string;
  workspacePath: string;
  contextFilePath: string;
  terminalBackend: TerminalBackend;
  ttydPort: number | null;
  /**
   * Set when lifecycle labels (`issuectl:deployed`, `issuectl:in-progress`)
   * could not be applied after the retry budget was exhausted. Launch
   * continues — the workspace and deployment row are valid — but the
   * lifecycle reconciler won't pick up this issue until the labels are
   * added by some other path. Surface this to the UI so the user knows
   * the state has drifted.
   */
  labelWarning?: string;
}

export async function executeLaunch(
  db: Database.Database,
  octokit: Octokit,
  options: LaunchOptions,
): Promise<LaunchResult> {
  const correlationId = options.correlationId ?? createLaunchCorrelationId();
  const targetType = options.targetType ?? "issue";
  const targetNumber = options.targetNumber ?? options.issueNumber;
  if (!Number.isInteger(targetNumber) || targetNumber === undefined || targetNumber <= 0) {
    throw new Error("Launch target number is required");
  }
  const issueNumber = targetType === "issue" ? targetNumber : undefined;
  const diagnosticContext = {
    db,
    correlationId,
    owner: options.owner,
    repo: options.repo,
    issueNumber: targetNumber,
  };
  recordLaunchRequested(diagnosticContext, {
    agent: options.agent,
    branchName: options.branchName,
    workspaceMode: options.workspaceMode,
  });

  const terminalBackend = selectTerminalBackend(db, options.terminalBackend);

  // 0. Verify terminal backend prerequisites.
  if (terminalBackend === "pty_bridge") {
    verifyTmux();
  } else {
    verifyTtyd();
  }

  const { contextString, expectedHeadRef, expectedHeadSha } =
    targetType === "pr"
      ? await buildPrLaunchContext(db, octokit, options, targetNumber)
      : await buildIssueLaunchContext(db, octokit, options, targetNumber);

  // 4. Write context to temp file
  const contextFilePath = await writeContextFile(
    contextString,
    targetNumber,
  );

  const { repoRecord, workspace } = await prepareLaunchWorkspace(db, {
    ...options,
    targetType,
    targetNumber,
  });
  recordWorkspacePrepared(diagnosticContext, workspace.path);

  // Steps 7-9 have side effects — if one fails, earlier artifacts remain.
  // Workspace cleanup is not attempted since the branch/files may be valuable.
  const labelWarning = await applyLaunchLifecycleLabels({
    octokit,
    owner: options.owner,
    repo: options.repo,
    targetType,
    targetNumber,
    diagnosticContext,
  });

  // 8. Record deployment in DB as pending. This row is INVISIBLE to the
  // UI and reconciler until step 9 succeeds — if the terminal launch
  // fails, we delete the row in the catch and no one ever saw it.
  //
  // The pre-check is an optimization, not a lock: concurrent launches
  // can both pass it, and the loser trips `idx_deployments_live` here.
  // Translate that one constraint into the friendly duplicate-launch
  // message so both sides of the race see the same story.
  const launchAgent = normalizeLaunchAgent(options.agent, getLaunchAgent(db));
  let deployment;
  try {
    deployment = recordDeployment(db, {
      repoId: repoRecord.id,
      issueNumber,
      targetType,
      targetNumber,
      agent: launchAgent,
      branchName: options.branchName,
      workspaceMode: options.workspaceMode,
      workspacePath: workspace.path,
      terminalBackend,
      triggeredBy: options.triggeredBy,
      completionToken: options.completionToken ?? null,
      state: "pending",
    });
    seedAgentActionBudgets(db, deployment.id, targetType, options.triggeredBy);
    recordDeploymentRecorded(diagnosticContext, deployment.id);
  } catch (err) {
    // `idx_deployments_live` is the only unique constraint on
    // `deployments`, so any SQLITE_CONSTRAINT_UNIQUE thrown here came
    // from that index. better-sqlite3 formats the message as
    // "UNIQUE constraint failed: deployments.repo_id, deployments.issue_number"
    // — the column list, not the index name — so match on `code`.
    if (
      err instanceof Error &&
      (err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
    ) {
      throw duplicateLaunchError(targetNumber, targetType);
    }
    throw err;
  }

  // 9. Spawn terminal backend
  const agentCommand = buildLaunchAgentCommand(
    launchAgent,
    getSetting(db, extraArgsSettingForAgent(launchAgent)),
  );
  const credentialPolicy = options.triggeredBy === "webhook" || options.triggeredBy === "comment_command"
    ? "scrubbed"
    : "ambient";
  console.warn(`[issuectl] launching: ${agentCommand}`);
  let ttydPort: number | null = null;
  const sessionName = tmuxSessionName(options.repo, targetNumber, targetType);
  const extraEnv = buildAgentEnvironment({
    completionToken: options.completionToken ?? null,
    deploymentId: deployment.id,
    repoId: repoRecord.id,
    targetType,
    targetNumber,
    expectedHeadRef,
    expectedHeadSha,
  });
  try {
    if (terminalBackend === "pty_bridge") {
      spawnPtyBridgeSession({
        workspacePath: workspace.path,
        contextFilePath,
        agentCommand,
        agentInputMode: launchAgent === "codex" ? "argument" : "stdin",
        sessionName,
        credentialPolicy,
        extraEnv,
      });
      recordPtyBridgeSpawned(diagnosticContext, {
        deploymentId: deployment.id,
        sessionName,
      });
    } else {
      const port = await allocatePort(db);
      // Reserve the port in the DB *before* spawning so concurrent launches
      // see it and pick a different port (fixes #198 TOCTOU race).
      reserveTtydPort(db, deployment.id, port);
      const { pid } = await spawnTtyd({
        port,
        workspacePath: workspace.path,
        contextFilePath,
        agentCommand,
        agentInputMode: launchAgent === "codex" ? "argument" : "stdin",
        sessionName,
        credentialPolicy,
        extraEnv,
      });
      updateTtydInfo(db, deployment.id, port, pid);
      recordTtydSpawned(diagnosticContext, {
        deploymentId: deployment.id,
        sessionName,
        ttydPort: port,
        ttydPid: pid,
      });
      ttydPort = port;
    }
  } catch (err) {
    recordLaunchSpawnFailed(diagnosticContext, {
      deploymentId: deployment.id,
      sessionName,
      error: err,
    });
    try {
      deletePendingDeployment(db, deployment.id);
    } catch (rollbackErr) {
      console.error(
        "[issuectl] Failed to roll back pending deployment after ttyd spawn failure",
        { deploymentId: deployment.id },
        rollbackErr,
      );
    }
    throw err;
  }

  // 9b. Flip pending → active. The deployment is now visible to the UI
  // and reconciler. If activation fails after the terminal opened, delete
  // the pending row so it doesn't block future launches for this issue.
  // The terminal is already open — the user must close it manually.
  activateRecordedDeployment(db, deployment.id, diagnosticContext);

  // 10. Return result
  return {
    deploymentId: deployment.id,
    branchName: options.branchName,
    workspacePath: workspace.path,
    contextFilePath,
    terminalBackend,
    ttydPort,
    labelWarning,
  };
}

export { generateBranchName } from "./branch.js";
export { type WorkspaceMode, type WorkspaceResult } from "./workspace.js";
export { type LaunchContext } from "./context.js";
export { buildClaudeCommand, buildLaunchAgentCommand } from "./launch-agent-command.js";
export { expandHome } from "./launch-workspace-setup.js";

function selectTerminalBackend(
  db: Database.Database,
  override?: TerminalBackend,
): TerminalBackend {
  if (override) return override;
  if (process.env.ISSUECTL_PTY_BRIDGE === "1") return "pty_bridge";
  return getSetting(db, "terminal_backend") === "pty_bridge" ? "pty_bridge" : "ttyd";
}

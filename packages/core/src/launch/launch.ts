import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { getSetting } from "../db/settings.js";
import {
  recordDeployment,
  activateDeployment,
  deletePendingDeployment,
  reserveTtydPort,
  updateTtydInfo,
} from "../db/deployments.js";
import { getIssueDetail } from "../data/issues.js";
import { ensureLifecycleLabels, addLabels, LIFECYCLE_LABEL } from "../github/labels.js";
import {
  assembleContext,
  writeContextFile,
  type LaunchContext,
} from "./context.js";
import type { WorkspaceMode } from "./workspace.js";
import { verifyTtyd, verifyTmux, spawnTtyd, spawnPtyBridgeSession, allocatePort, tmuxSessionName } from "./ttyd.js";
import type { LaunchAgent, TerminalBackend } from "../types.js";
import {
  buildLaunchAgentCommand,
  extraArgsSettingForAgent,
  getLaunchAgent,
  normalizeLaunchAgent,
  retryLabel,
} from "./launch-agent-command.js";
import {
  createLaunchCorrelationId,
  recordDeploymentActivated,
  recordDeploymentRecorded,
  recordLaunchActivationFailed,
  recordLaunchLabelsFailed,
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

export interface LaunchOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  agent?: LaunchAgent;
  branchName: string;
  workspaceMode: WorkspaceMode;
  selectedComments: number[];
  selectedFiles: string[];
  preamble?: string;
  forceResume?: boolean;
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
  const diagnosticContext = {
    db,
    correlationId,
    owner: options.owner,
    repo: options.repo,
    issueNumber: options.issueNumber,
  };
  recordLaunchRequested(diagnosticContext, {
    agent: options.agent,
    branchName: options.branchName,
    workspaceMode: options.workspaceMode,
  });

  const terminalBackend = selectTerminalBackend(db);

  // 0. Verify terminal backend prerequisites.
  if (terminalBackend === "pty_bridge") {
    verifyTmux();
  } else {
    verifyTtyd();
  }

  // 1. Fetch issue detail
  const detail = await getIssueDetail(
    db,
    octokit,
    options.owner,
    options.repo,
    options.issueNumber,
  );

  // 2. Filter comments/files based on selections
  const filteredComments = options.selectedComments.map((i) => {
    const c = detail.comments[i];
    if (!c) throw new Error(`Comment index ${i} out of range`);
    return {
      author: c.user?.login ?? "unknown",
      body: c.body,
      createdAt: c.createdAt,
    };
  });

  const filteredFiles =
    options.selectedFiles.length > 0
      ? options.selectedFiles
      : detail.referencedFiles;

  // 3. Assemble context string
  const launchContext: LaunchContext = {
    issueNumber: options.issueNumber,
    issueTitle: detail.issue.title,
    issueBody: detail.issue.body ?? "",
    comments: filteredComments,
    referencedFiles: filteredFiles,
    preamble: options.preamble,
  };
  const contextString = assembleContext(launchContext);

  // 4. Write context to temp file
  const contextFilePath = await writeContextFile(
    contextString,
    options.issueNumber,
  );

  const { repoRecord, workspace } = await prepareLaunchWorkspace(db, options);
  recordWorkspacePrepared(diagnosticContext, workspace.path);

  // Steps 7-9 have side effects — if one fails, earlier artifacts remain.
  // Workspace cleanup is not attempted since the branch/files may be valuable.
  let labelWarning: string | undefined;
  try {
    // 7. Apply lifecycle labels in a single API call. Retry up to 3
    // times because label failures are usually transient (rate limit,
    // network blip) and dropped labels leave the reconciler unable to
    // advance this issue.
    await ensureLifecycleLabels(octokit, options.owner, options.repo);
    await retryLabel(() =>
      addLabels(
        octokit,
        options.owner,
        options.repo,
        options.issueNumber,
        [LIFECYCLE_LABEL.deployed, LIFECYCLE_LABEL.inProgress],
      ),
    );
  } catch (err) {
    // Final failure is non-fatal — the workspace is ready, proceed anyway
    // but record a warning so the caller can tell the user.
    const msg = err instanceof Error ? err.message : String(err);
    labelWarning = `Could not apply lifecycle labels after 3 attempts (${msg}). Launch continued, but lifecycle status may not update automatically — you may need to add labels manually.`;
    recordLaunchLabelsFailed(diagnosticContext, msg);
    console.warn("[issuectl] Failed to apply lifecycle labels after retries:", err);
  }

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
      issueNumber: options.issueNumber,
      agent: launchAgent,
      branchName: options.branchName,
      workspaceMode: options.workspaceMode,
      workspacePath: workspace.path,
      terminalBackend,
      state: "pending",
    });
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
      throw duplicateLaunchError(options.issueNumber);
    }
    throw err;
  }

  // 9. Spawn terminal backend
  const agentCommand = buildLaunchAgentCommand(
    launchAgent,
    getSetting(db, extraArgsSettingForAgent(launchAgent)),
  );
  console.warn(`[issuectl] launching: ${agentCommand}`);
  let ttydPort: number | null = null;
  const sessionName = tmuxSessionName(options.repo, options.issueNumber);
  try {
    if (terminalBackend === "pty_bridge") {
      spawnPtyBridgeSession({
        workspacePath: workspace.path,
        contextFilePath,
        agentCommand,
        agentInputMode: launchAgent === "codex" ? "argument" : "stdin",
        sessionName,
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
  try {
    activateDeployment(db, deployment.id);
    recordDeploymentActivated(diagnosticContext, deployment.id);
  } catch (err) {
    recordLaunchActivationFailed(diagnosticContext, {
      deploymentId: deployment.id,
      error: err,
    });
    console.error(
      "[issuectl] Failed to activate deployment after terminal opened — deleting pending row",
      { deploymentId: deployment.id },
      err,
    );
    try {
      deletePendingDeployment(db, deployment.id);
    } catch (deleteErr) {
      console.error(
        "[issuectl] Failed to clean up orphaned pending deployment",
        { deploymentId: deployment.id },
        deleteErr,
      );
    }
    throw new Error(
      `Launch failed: terminal opened but deployment could not be activated (id=${deployment.id}). Close the terminal manually.`,
      { cause: err },
    );
  }

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

function selectTerminalBackend(db: Database.Database): TerminalBackend {
  if (process.env.ISSUECTL_PTY_BRIDGE === "1") return "pty_bridge";
  return getSetting(db, "terminal_backend") === "pty_bridge" ? "pty_bridge" : "ttyd";
}

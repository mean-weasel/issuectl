import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { getRepo } from "../db/repos.js";
import { getSetting } from "../db/settings.js";
import {
  recordDeployment,
  activateDeployment,
  deletePendingDeployment,
  hasLiveDeploymentForIssue,
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
import { prepareWorkspace, type WorkspaceMode } from "./workspace.js";
import { verifyTtyd, spawnTtyd, allocatePort } from "./ttyd.js";

export interface LaunchOptions {
  owner: string;
  repo: string;
  issueNumber: number;
  branchName: string;
  workspaceMode: WorkspaceMode;
  selectedComments: number[];
  selectedFiles: string[];
  preamble?: string;
}

export interface LaunchResult {
  deploymentId: number;
  branchName: string;
  workspacePath: string;
  contextFilePath: string;
  ttydPort: number;
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

function expandHome(p: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "/";
  if (p === "~") return home;
  if (p.startsWith("~/")) return home + p.slice(1);
  return p;
}

function duplicateLaunchError(issueNumber: number): Error {
  return new Error(
    `Issue #${issueNumber} already has an active deployment. End the existing session before launching again.`,
  );
}

export async function executeLaunch(
  db: Database.Database,
  octokit: Octokit,
  options: LaunchOptions,
): Promise<LaunchResult> {
  // 0. Verify ttyd is installed
  verifyTtyd();

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

  // 5. Get repo local path from DB
  const repoRecord = getRepo(db, options.owner, options.repo);
  if (!repoRecord) {
    throw new Error(
      `Repository ${options.owner}/${options.repo} not found in database`,
    );
  }

  // Cheap pre-check before the expensive git work in step 6. The partial
  // unique index `idx_deployments_live` is the source of truth at insert
  // time (step 8); this lookup just avoids burning workspace prep on a
  // request that will be rejected anyway.
  if (hasLiveDeploymentForIssue(db, repoRecord.id, options.issueNumber)) {
    throw duplicateLaunchError(options.issueNumber);
  }

  const repoPath = repoRecord.localPath
    ? expandHome(repoRecord.localPath)
    : null;

  if (!repoPath && options.workspaceMode !== "clone") {
    const modeLabel =
      options.workspaceMode === "worktree" ? "Worktree mode" : "Existing-repo mode";
    throw new Error(
      `${modeLabel} requires a local path for ${options.owner}/${options.repo}. ` +
      `Set a local path in Settings, or use "Fresh clone" mode instead.`,
    );
  }

  // 6. Prepare workspace
  const worktreeDir = expandHome(
    getSetting(db, "worktree_dir") ?? "~/.issuectl/worktrees/",
  );

  const workspace = await prepareWorkspace({
    mode: options.workspaceMode,
    repoPath: repoPath ?? "",
    owner: options.owner,
    repo: options.repo,
    branchName: options.branchName,
    issueNumber: options.issueNumber,
    worktreeDir,
  });

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
  let deployment;
  try {
    deployment = recordDeployment(db, {
      repoId: repoRecord.id,
      issueNumber: options.issueNumber,
      branchName: options.branchName,
      workspaceMode: options.workspaceMode,
      workspacePath: workspace.path,
      state: "pending",
    });
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

  // 9. Spawn ttyd
  const claudeCommand = buildClaudeCommand(getSetting(db, "claude_extra_args"));
  console.warn(`[issuectl] launching: ${claudeCommand}`);
  let ttydPort: number;
  try {
    const port = await allocatePort(db);
    // Reserve the port in the DB *before* spawning so concurrent launches
    // see it and pick a different port (fixes #198 TOCTOU race).
    reserveTtydPort(db, deployment.id, port);
    const { pid } = await spawnTtyd({
      port,
      workspacePath: workspace.path,
      contextFilePath,
      claudeCommand,
      sessionName: `issuectl-${options.repo}-${options.issueNumber}`,
    });
    updateTtydInfo(db, deployment.id, port, pid);
    ttydPort = port;
  } catch (err) {
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
  } catch (err) {
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
    ttydPort,
    labelWarning,
  };
}

async function retryLabel<T>(fn: () => Promise<T>): Promise<T> {
  const delaysMs = [500, 1_000, 2_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt < delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < delaysMs.length - 1) {
        await new Promise((r) => setTimeout(r, delaysMs[attempt]));
      }
    }
  }
  throw lastErr;
}

const DANGEROUS_METACHARS = /[;&|<>`$\n\r\t()]/;

/**
 * Build the shell command that the terminal launcher will run. The stored
 * value is trusted (validated at save time) but we apply a cheap metachar
 * check as defense-in-depth — if the value looks dangerous (tampered DB,
 * backup restore, etc.), fall back to plain `claude` and warn.
 */
export function buildClaudeCommand(rawExtraArgs: string | undefined): string {
  const extraArgs = rawExtraArgs?.trim() ?? "";
  if (extraArgs === "") return "claude";
  if (DANGEROUS_METACHARS.test(extraArgs)) {
    console.warn(
      `[issuectl] claude_extra_args contains unexpected shell metacharacters; falling back to plain 'claude'. Re-save the value in Settings to re-validate. Got: ${JSON.stringify(extraArgs)}`,
    );
    return "claude";
  }
  return `claude ${extraArgs}`;
}

export { generateBranchName } from "./branch.js";
export { type WorkspaceMode, type WorkspaceResult } from "./workspace.js";
export { type LaunchContext } from "./context.js";

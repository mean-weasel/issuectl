import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { getRepo } from "../db/repos.js";
import { getSetting } from "../db/settings.js";
import {
  recordDeployment,
  activateDeployment,
  deletePendingDeployment,
} from "../db/deployments.js";
import { getIssueDetail } from "../data/issues.js";
import { ensureLifecycleLabels, addLabel } from "../github/labels.js";
import { LIFECYCLE_LABEL } from "../github/labels.js";
import {
  assembleContext,
  writeContextFile,
  type LaunchContext,
} from "./context.js";
import { prepareWorkspace, type WorkspaceMode } from "./workspace.js";
import { getTerminalLauncher, type SupportedTerminal } from "./terminal.js";

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
  /**
   * Set when the `issuectl:deployed` label could not be applied after the
   * retry budget was exhausted. Launch continues in that case — the workspace
   * and deployment row are valid — but the lifecycle reconciler won't pick
   * up this issue until the label is added by some other path. Surface this
   * to the UI so the user knows the state has drifted.
   */
  labelWarning?: string;
}

function expandHome(p: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "/";
  if (p === "~") return home;
  if (p.startsWith("~/")) return home + p.slice(1);
  return p;
}

export async function executeLaunch(
  db: Database.Database,
  octokit: Octokit,
  options: LaunchOptions,
): Promise<LaunchResult> {
  // 0. Build terminal launcher and verify
  const terminalSettings = {
    terminal: (getSetting(db, "terminal_app") ?? "ghostty") as SupportedTerminal,
    windowTitle: getSetting(db, "terminal_window_title") ?? "issuectl",
    tabTitlePattern: getSetting(db, "terminal_tab_title_pattern") ?? "#{number} — {title}",
  };
  const launcher = getTerminalLauncher(terminalSettings);
  await launcher.verify();

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

  const repoPath = repoRecord.localPath
    ? expandHome(repoRecord.localPath)
    : null;

  if (!repoPath && options.workspaceMode !== "clone") {
    throw new Error(
      `No local path configured for ${options.owner}/${options.repo}. Set a local path in settings or use clone mode.`,
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
    // 7. Apply issuectl:deployed label. Retry up to 3 times because label
    // failures are usually transient (rate limit, network blip) and a
    // dropped label leaves the reconciler unable to advance this issue.
    await ensureLifecycleLabels(octokit, options.owner, options.repo);
    await retryLabel(() =>
      addLabel(
        octokit,
        options.owner,
        options.repo,
        options.issueNumber,
        LIFECYCLE_LABEL.deployed,
      ),
    );
  } catch (err) {
    // Final failure is non-fatal — the workspace is ready, proceed anyway
    // but record a warning so the caller can tell the user.
    const msg = err instanceof Error ? err.message : String(err);
    labelWarning = `Could not apply the \`${LIFECYCLE_LABEL.deployed}\` label after 3 attempts (${msg}). Launch continued, but lifecycle status may not update automatically — you may need to add the label manually.`;
    console.warn("[issuectl] Failed to apply deployed label after retries:", err);
  }

  // 8. Record deployment in DB as pending. This row is INVISIBLE to the
  // UI and reconciler until step 9 succeeds — if the terminal launch
  // fails, we delete the row in the catch and no one ever saw it.
  const deployment = recordDeployment(db, {
    repoId: repoRecord.id,
    issueNumber: options.issueNumber,
    branchName: options.branchName,
    workspaceMode: options.workspaceMode,
    workspacePath: workspace.path,
    state: "pending",
  });

  // 9. Open terminal
  //
  // claude_extra_args is validated at save time by validateClaudeArgs in the
  // Server Action. We don't re-validate here — but we DO a cheap metachar
  // sanity check as defense-in-depth against a tampered DB. If the stored
  // value looks dangerous, we fall back to plain "claude" and log a warning.
  const claudeCommand = buildClaudeCommand(getSetting(db, "claude_extra_args"));
  console.warn(`[issuectl] launching: ${claudeCommand}`);
  try {
    await launcher.launch({
      workspacePath: workspace.path,
      contextFilePath,
      issueNumber: options.issueNumber,
      issueTitle: detail.issue.title,
      owner: options.owner,
      repo: options.repo,
      claudeCommand,
    });
  } catch (err) {
    // Terminal launch failed — unwind the pending deployment row so the
    // UI doesn't show a phantom active session. The workspace artifacts
    // (branch, worktree/clone directory) stay put since they may be
    // valuable; only the DB state is rolled back.
    try {
      deletePendingDeployment(db, deployment.id);
    } catch (rollbackErr) {
      console.error(
        "[issuectl] Failed to roll back pending deployment after launch failure",
        { deploymentId: deployment.id },
        rollbackErr,
      );
    }
    throw err;
  }

  // 9b. Flip pending → active. The deployment is now visible to the UI
  // and reconciler.
  activateDeployment(db, deployment.id);

  // 10. Return result
  return {
    deploymentId: deployment.id,
    branchName: options.branchName,
    workspacePath: workspace.path,
    contextFilePath,
    ...(labelWarning ? { labelWarning } : {}),
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

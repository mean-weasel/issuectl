import type Database from "better-sqlite3";
import type { Octokit } from "@octokit/rest";
import { getRepo } from "../db/repos.js";
import { getSetting } from "../db/settings.js";
import { recordDeployment } from "../db/deployments.js";
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
  try {
    // 7. Apply issuectl:deployed label
    await ensureLifecycleLabels(octokit, options.owner, options.repo);
    await addLabel(
      octokit,
      options.owner,
      options.repo,
      options.issueNumber,
      LIFECYCLE_LABEL.deployed,
    );
  } catch (err) {
    // Label failure is non-fatal — the workspace is ready, proceed anyway
    console.warn("[issuectl] Failed to apply deployed label:", err);
  }

  // 8. Record deployment in DB
  const deployment = recordDeployment(db, {
    repoId: repoRecord.id,
    issueNumber: options.issueNumber,
    branchName: options.branchName,
    workspaceMode: options.workspaceMode,
    workspacePath: workspace.path,
  });

  // 9. Open terminal
  //
  // claude_extra_args is validated at save time by validateClaudeArgs in the
  // Server Action. We don't re-validate here — but we DO a cheap metachar
  // sanity check as defense-in-depth against a tampered DB. If the stored
  // value looks dangerous, we fall back to plain "claude" and log a warning.
  const claudeCommand = buildClaudeCommand(getSetting(db, "claude_extra_args"));
  console.warn(`[issuectl] launching: ${claudeCommand}`);
  await launcher.launch({
    workspacePath: workspace.path,
    contextFilePath,
    issueNumber: options.issueNumber,
    issueTitle: detail.issue.title,
    owner: options.owner,
    repo: options.repo,
    claudeCommand,
  });

  // 10. Return result
  return {
    deploymentId: deployment.id,
    branchName: options.branchName,
    workspacePath: workspace.path,
    contextFilePath,
  };
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

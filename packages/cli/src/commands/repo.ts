import { existsSync } from "node:fs";
import { confirm, input } from "@inquirer/prompts";
import {
  addRepo,
  removeRepo,
  listRepos,
  getRepo,
  getActiveWebhookDeploymentsForRepoTarget,
  endDeployment,
  killTtyd,
  killTmuxSession,
  setSetting,
  tmuxSessionName,
  updateRepo,
  updateRepoWebhookSettings,
} from "@issuectl/core";
import type { LaunchAgent, WebhookPayloadMode } from "@issuectl/core";
import * as log from "../utils/logger.js";
import { requireDb } from "../utils/db.js";
import { isValidOwnerRepo, parseOwnerRepo } from "../utils/validation.js";

function requireValidOwnerRepo(value: string): { owner: string; name: string } {
  if (!isValidOwnerRepo(value)) {
    log.error("Invalid format. Use: owner/name (e.g., mean-weasel/seatify)");
    process.exit(1);
  }
  return parseOwnerRepo(value);
}

export async function repoAddCommand(
  ownerRepo: string,
  options: RepoCommandOptions,
): Promise<void> {
  const { owner, name } = requireValidOwnerRepo(ownerRepo);
  const db = requireDb();

  const existing = getRepo(db, owner, name);
  if (existing) {
    log.warn(`${owner}/${name} is already tracked.`);
    return;
  }

  let localPath = options.path;
  if (!localPath) {
    localPath = await input({
      message: "Local path (optional, press Enter to skip):",
      default: "",
    });
  }

  if (localPath && !existsSync(localPath)) {
    log.warn(`Path "${localPath}" does not exist. Saving anyway.`);
  }

  const repo = addRepo(db, {
    owner,
    name,
    localPath: localPath || undefined,
  });
  applyWebhookOptions(db, repo, options);
  log.success(`Added ${repo.owner}/${repo.name}`);
}

export async function repoRemoveCommand(ownerRepo: string): Promise<void> {
  const { owner, name } = requireValidOwnerRepo(ownerRepo);
  const db = requireDb();
  const repo = getRepo(db, owner, name);

  if (!repo) {
    log.error(`${owner}/${name} is not tracked.`);
    process.exit(1);
  }

  const ok = await confirm({
    message: `Remove ${owner}/${name}?`,
    default: false,
  });

  if (!ok) {
    log.info("Cancelled.");
    return;
  }

  removeRepo(db, repo.id);
  log.success(`Removed ${owner}/${name}`);
}

export function repoListCommand(): void {
  const db = requireDb();
  const repos = listRepos(db);

  if (repos.length === 0) {
    log.info("No repositories tracked. Run `issuectl repo add` to add one.");
    return;
  }

  console.error("");
  for (const repo of repos) {
    const path = repo.localPath ?? "(no local path)";
    const pattern = repo.branchPattern ?? "(default)";
    console.error(`  ${repo.owner}/${repo.name}`);
    console.error(`    Path:    ${path}`);
    console.error(`    Pattern: ${pattern}`);
    console.error("");
  }
}

export async function repoUpdateCommand(
  ownerRepo: string,
  options: RepoCommandOptions,
): Promise<void> {
  const { owner, name } = requireValidOwnerRepo(ownerRepo);
  const db = requireDb();
  const repo = getRepo(db, owner, name);

  if (!repo) {
    log.error(`${owner}/${name} is not tracked.`);
    process.exit(1);
  }

  let changed = false;
  if (options.path) {
    if (!existsSync(options.path)) {
      log.warn(`Path "${options.path}" does not exist. Saving anyway.`);
    }
    updateRepo(db, repo.id, { localPath: options.path });
    log.success(`Updated ${owner}/${name} path to ${options.path}`);
    changed = true;
  }
  if (applyWebhookOptions(db, repo, options)) {
    log.success(`Updated ${owner}/${name} webhook settings`);
    changed = true;
  }
  if (!changed) {
    log.warn("No updates specified. Use --path to update the local path.");
  }
}

export async function repoSetCommand(
  ownerRepo: string,
  options: RepoSetCommandOptions,
): Promise<void> {
  await repoUpdateCommand(ownerRepo, normalizeSetOptions(options));
}

export function repoShowCommand(ownerRepo: string): void {
  const { owner, name } = requireValidOwnerRepo(ownerRepo);
  const db = requireDb();
  const repo = getRepo(db, owner, name);

  if (!repo) {
    log.error(`${owner}/${name} is not tracked.`);
    process.exit(1);
  }

  console.error(`${repo.owner}/${repo.name}`);
  console.error(`  path: ${repo.localPath ?? "(no local path)"}`);
  console.error(`  branch pattern: ${repo.branchPattern ?? "(default)"}`);
  console.error(`  auto-launch issues: ${repo.autoLaunchIssues}`);
  console.error(`  auto-review PRs: ${repo.autoReviewPrs}`);
  console.error(`  issue agent: ${repo.issueAgent}`);
  console.error(`  review agent: ${repo.reviewAgent}`);
  console.error(`  payload mode: ${repo.webhookPayloadMode}`);
}

type RepoCommandOptions = {
  path?: string;
  autoLaunchIssues?: boolean | string;
  autoReviewPrs?: boolean | string;
  issueAgent?: LaunchAgent | string;
  reviewAgent?: LaunchAgent | string;
  webhookPayloadMode?: WebhookPayloadMode | string;
  webhookBaseUrl?: string;
};

type RepoSetCommandOptions = {
  autoLaunchIssues?: string;
  autoReviewPrs?: string;
  issueAgent?: string;
  reviewAgent?: string;
  webhookPayloadMode?: string;
  webhookBaseUrl?: string;
};

function applyWebhookOptions(
  db: ReturnType<typeof requireDb>,
  repo: { id: number; name: string; autoLaunchIssues: boolean; autoReviewPrs: boolean },
  options: RepoCommandOptions,
): boolean {
  const webhookBaseUrl = options.webhookBaseUrl === undefined
    ? undefined
    : normalizeWebhookBaseUrl(options.webhookBaseUrl);
  const updates = {
    autoLaunchIssues: normalizeOptionalBoolean(options.autoLaunchIssues, "--auto-launch-issues"),
    autoReviewPrs: normalizeOptionalBoolean(options.autoReviewPrs, "--auto-review-prs"),
    issueAgent: normalizeOptionalAgent(options.issueAgent, "--issue-agent"),
    reviewAgent: normalizeOptionalAgent(options.reviewAgent, "--review-agent"),
    webhookPayloadMode: normalizeOptionalPayloadMode(options.webhookPayloadMode),
  };
  const compact = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  );
  if (webhookBaseUrl !== undefined) {
    setSetting(db, "public_webhook_base_url", webhookBaseUrl);
  }
  if (Object.keys(compact).length === 0) return options.webhookBaseUrl !== undefined;
  updateRepoWebhookSettings(db, repo.id, compact);
  endDisabledAutomationSessions(db, repo, updates);
  return true;
}

function normalizeSetOptions(options: RepoSetCommandOptions): RepoCommandOptions {
  return {
    autoLaunchIssues: options.autoLaunchIssues,
    autoReviewPrs: options.autoReviewPrs,
    issueAgent: options.issueAgent,
    reviewAgent: options.reviewAgent,
    webhookPayloadMode: options.webhookPayloadMode,
    webhookBaseUrl: options.webhookBaseUrl,
  };
}

function normalizeOptionalBoolean(
  value: boolean | string | undefined,
  optionName: string,
): boolean | undefined {
  if (value === undefined || typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${optionName} must be true or false.`);
}

function normalizeOptionalAgent(
  value: LaunchAgent | string | undefined,
  optionName: string,
): LaunchAgent | undefined {
  if (value === undefined) return undefined;
  if (value === "claude" || value === "codex") return value;
  throw new Error(`${optionName} must be claude or codex.`);
}

function normalizeOptionalPayloadMode(value: WebhookPayloadMode | string | undefined): WebhookPayloadMode | undefined {
  if (value === undefined) return undefined;
  if (value === "metadata" || value === "raw") return value;
  throw new Error("--webhook-payload-mode must be metadata or raw.");
}

function normalizeWebhookBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!/^https?:\/\/[^/\s]+(?:\/[^\s]*)?$/.test(trimmed)) {
    throw new Error("--webhook-base-url must be an http(s) URL.");
  }
  return trimmed.replace(/\/$/, "");
}

function endDisabledAutomationSessions(
  db: ReturnType<typeof requireDb>,
  repo: { id: number; name: string; autoLaunchIssues: boolean; autoReviewPrs: boolean },
  updates: { autoLaunchIssues?: boolean; autoReviewPrs?: boolean },
): void {
  if (repo.autoLaunchIssues && updates.autoLaunchIssues === false) {
    endActiveWebhookDeployments(db, repo.id, repo.name, "issue");
  }
  if (repo.autoReviewPrs && updates.autoReviewPrs === false) {
    endActiveWebhookDeployments(db, repo.id, repo.name, "pr");
  }
}

function endActiveWebhookDeployments(
  db: ReturnType<typeof requireDb>,
  repoId: number,
  repoName: string,
  targetType: "issue" | "pr",
): void {
  for (const deployment of getActiveWebhookDeploymentsForRepoTarget(db, repoId, targetType)) {
    const sessionName = tmuxSessionName(repoName, deployment.targetNumber, targetType);
    if (deployment.ttydPid) killTtyd(deployment.ttydPid, sessionName);
    else if (deployment.terminalBackend === "pty_bridge") killTmuxSession(sessionName);
    endDeployment(db, deployment.id, "killed_by_label");
  }
}

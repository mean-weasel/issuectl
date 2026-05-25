/* eslint-disable max-lines */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { confirm, input } from "@inquirer/prompts";
import {
  addRepo,
  removeRepo,
  listRepos,
  getRepo,
  getActiveWebhookDeploymentsForRepoTarget,
  markActivePrReviewForDeploymentTerminal,
  endDeployment,
  killTtyd,
  killTmuxSession,
  recordDiagnosticEventSafely,
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

  const webhookOptions = await collectRepoAddWebhookOptions(options);
  const repo = addRepo(db, {
    owner,
    name,
    localPath: localPath || undefined,
  });
  applyWebhookOptions(db, repo, webhookOptions);
  log.success(`Added ${repo.owner}/${repo.name}`);
  printRepoAddNextSteps(repo.owner, repo.name, webhookOptions);
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

  const endedIssueSessionIds = endActiveWebhookDeployments(db, repo.id, repo.name, "issue");
  const endedPrSessionIds = endActiveWebhookDeployments(db, repo.id, repo.name, "pr");
  removeRepo(db, repo.id);
  recordDiagnosticEventSafely(db, {
    level: "info",
    event: "repo.removed",
    source: "cli",
    owner,
    repo: name,
    message: "Repository removed from issuectl",
    data: { repoId: repo.id, affectedSessionIds: [...endedIssueSessionIds, ...endedPrSessionIds] },
  });
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

async function collectRepoAddWebhookOptions(
  options: RepoCommandOptions,
): Promise<RepoCommandOptions> {
  const autoLaunchIssues = options.autoLaunchIssues === undefined
    ? await confirm({
        message: "Auto-launch issue sessions from webhooks?",
        default: true,
      })
    : normalizeOptionalBoolean(options.autoLaunchIssues, "--auto-launch-issues");
  const autoReviewPrs = options.autoReviewPrs === undefined
    ? await confirm({
        message: "Reserve PRs for automatic review from webhooks?",
        default: true,
      })
    : normalizeOptionalBoolean(options.autoReviewPrs, "--auto-review-prs");
  const automationEnabled = autoLaunchIssues || autoReviewPrs;

  let issueAgent = normalizeOptionalAgent(options.issueAgent, "--issue-agent");
  if (autoLaunchIssues && issueAgent === undefined) {
    issueAgent = await promptLaunchAgent("Issue session agent", "codex");
  }

  let reviewAgent = normalizeOptionalAgent(options.reviewAgent, "--review-agent");
  if (autoReviewPrs && reviewAgent === undefined) {
    reviewAgent = await promptLaunchAgent("PR review agent", "codex");
  }

  let webhookPayloadMode = normalizeOptionalPayloadMode(options.webhookPayloadMode);
  if (automationEnabled && webhookPayloadMode === undefined) {
    webhookPayloadMode = await promptWebhookPayloadMode();
  }

  let webhookBaseUrl = options.webhookBaseUrl;
  if (automationEnabled && webhookBaseUrl === undefined) {
    const value = await input({
      message: "Public webhook base URL (optional, e.g. https://hooks.example.com):",
      default: "",
      validate: (candidate) => {
        if (!candidate.trim()) return true;
        try {
          normalizeWebhookBaseUrl(candidate);
          return true;
        } catch (err) {
          return err instanceof Error ? err.message : "Invalid URL";
        }
      },
    });
    webhookBaseUrl = value.trim() || undefined;
  }

  if (automationEnabled) {
    runRepoAddPreflight(webhookBaseUrl);
  }

  return {
    ...options,
    autoLaunchIssues,
    autoReviewPrs,
    issueAgent,
    reviewAgent,
    webhookPayloadMode,
    webhookBaseUrl,
  };
}

async function promptLaunchAgent(
  message: string,
  defaultValue: LaunchAgent,
): Promise<LaunchAgent> {
  const value = await input({
    message,
    default: defaultValue,
    validate: (candidate) =>
      candidate === "claude" || candidate === "codex"
        ? true
        : "Use claude or codex.",
  });
  return normalizeOptionalAgent(value || defaultValue, "--agent") ?? defaultValue;
}

async function promptWebhookPayloadMode(): Promise<WebhookPayloadMode> {
  const value = await input({
    message: "Webhook payload storage mode",
    default: "metadata",
    validate: (candidate) =>
      candidate === "metadata" || candidate === "raw"
        ? true
        : "Use metadata or raw.",
  });
  return normalizeOptionalPayloadMode(value || "metadata") ?? "metadata";
}

function runRepoAddPreflight(webhookBaseUrl?: string): void {
  const ghScopes = getGhAuthScopes();
  if (ghScopes === "missing") {
    log.warn("GitHub CLI auth check unavailable. Run `gh auth status --show-token-scopes` and confirm repo hook access before installing the webhook.");
  } else if (!hasRepoHookScope(ghScopes)) {
    log.warn("GitHub CLI token may be missing repo hook scope. Re-auth with `gh auth refresh -s admin:repo_hook` before webhook install.");
  }

  if (!commandWorks("cloudflared", ["--version"])) {
    log.warn("cloudflared was not found. Install it or provide a public --webhook-base-url before installing GitHub webhooks.");
  }

  if (!webhookBaseUrl) {
    log.info("After you have a public webhook URL, run `issuectl webhook create owner/repo` or finish setup from repo settings.");
  }
}

function getGhAuthScopes(): string | "missing" {
  try {
    return String(execFileSync("gh", ["auth", "status", "--show-token-scopes"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }));
  } catch {
    return "missing";
  }
}

function hasRepoHookScope(output: string): boolean {
  return /\badmin:repo_hook\b/.test(output) || /\brepo\b/.test(output);
}

function commandWorks(command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function printRepoAddNextSteps(
  owner: string,
  name: string,
  options: RepoCommandOptions,
): void {
  const issueAutomation = normalizeOptionalBoolean(options.autoLaunchIssues, "--auto-launch-issues");
  const reviewAutomation = normalizeOptionalBoolean(options.autoReviewPrs, "--auto-review-prs");
  if (!issueAutomation && !reviewAutomation) return;

  log.info(`Webhook settings saved for ${owner}/${name}.`);
  log.info(`Open repo settings or run \`issuectl webhook create ${owner}/${name}\` to finish GitHub installation.`);
}

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
  const endedSessionIds = endDisabledAutomationSessions(db, repo, updates);
  recordAutomationDiagnostics(db, repo, updates, endedSessionIds);
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
  repo: { id: number; owner?: string; name: string; autoLaunchIssues: boolean; autoReviewPrs: boolean },
  updates: { autoLaunchIssues?: boolean; autoReviewPrs?: boolean },
): { issue: number[]; pr: number[] } {
  const ended = { issue: [] as number[], pr: [] as number[] };
  if (repo.autoLaunchIssues && updates.autoLaunchIssues === false) {
    ended.issue = endActiveWebhookDeployments(db, repo.id, repo.name, "issue");
  }
  if (repo.autoReviewPrs && updates.autoReviewPrs === false) {
    ended.pr = endActiveWebhookDeployments(db, repo.id, repo.name, "pr");
  }
  return ended;
}

function endActiveWebhookDeployments(
  db: ReturnType<typeof requireDb>,
  repoId: number,
  repoName: string,
  targetType: "issue" | "pr",
): number[] {
  const endedSessionIds: number[] = [];
  for (const deployment of getActiveWebhookDeploymentsForRepoTarget(db, repoId, targetType)) {
    const sessionName = tmuxSessionName(repoName, deployment.targetNumber, targetType);
    if (deployment.ttydPid) killTtyd(deployment.ttydPid, sessionName);
    else if (deployment.terminalBackend === "pty_bridge") killTmuxSession(sessionName);
    endDeployment(db, deployment.id, "killed_by_label");
    if (targetType === "pr") {
      markActivePrReviewForDeploymentTerminal(db, deployment.id, {
        completedAt: Date.now(),
        status: "superseded",
        reason: "killed_by_label",
      });
    }
    endedSessionIds.push(deployment.id);
  }
  return endedSessionIds;
}

function recordAutomationDiagnostics(
  db: ReturnType<typeof requireDb>,
  repo: { id: number; owner?: string; name: string; autoLaunchIssues: boolean; autoReviewPrs: boolean },
  updates: { autoLaunchIssues?: boolean; autoReviewPrs?: boolean },
  affectedSessionIds: { issue: number[]; pr: number[] },
): void {
  if (updates.autoLaunchIssues !== undefined && updates.autoLaunchIssues !== repo.autoLaunchIssues) {
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: updates.autoLaunchIssues ? "repo.automation_enabled" : "repo.automation_disabled",
      source: "cli",
      owner: repo.owner,
      repo: repo.name,
      message: updates.autoLaunchIssues ? "Issue auto-launch enabled" : "Issue auto-launch disabled",
      data: { repoId: repo.id, targetType: "issue", affectedSessionIds: affectedSessionIds.issue },
    });
  }
  if (updates.autoReviewPrs !== undefined && updates.autoReviewPrs !== repo.autoReviewPrs) {
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: updates.autoReviewPrs ? "repo.automation_enabled" : "repo.automation_disabled",
      source: "cli",
      owner: repo.owner,
      repo: repo.name,
      message: updates.autoReviewPrs ? "PR auto-review enabled" : "PR auto-review disabled",
      data: { repoId: repo.id, targetType: "pr", affectedSessionIds: affectedSessionIds.pr },
    });
  }
}

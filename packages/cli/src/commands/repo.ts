/* eslint-disable max-lines */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { confirm, input } from "@inquirer/prompts";
import {
  addRepo,
  createIssuectlWebhook,
  removeRepo,
  listRepos,
  getRepo,
  getActiveWebhookDeploymentsForRepoTarget,
  listWebhookEvents,
  markActivePrReviewForDeploymentTerminal,
  formatErrorForUser,
  killTtyd,
  killTmuxSession,
  recordDiagnosticEventSafely,
  setSetting,
  tmuxSessionName,
  updateRepo,
  updateRepoWebhookSettings,
  withAuthRetry,
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

function transitionDeploymentTerminal(
  db: ReturnType<typeof requireDb>,
  deploymentId: number,
  terminalReason: "killed_by_label",
): { changed: boolean } {
  const result = db.prepare(
    "UPDATE deployments SET ended_at = datetime('now'), idle_since = NULL, terminal_reason = COALESCE(?, terminal_reason) WHERE id = ? AND ended_at IS NULL",
  ).run(terminalReason, deploymentId);
  if (result.changes > 0) return { changed: true };
  const row = db.prepare("SELECT 1 FROM deployments WHERE id = ?").get(deploymentId);
  if (!row) throw new Error(`No deployment found with id ${deploymentId}`);
  return { changed: false };
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
  await installRepoWebhookIfReady(db, repo, webhookOptions);
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
  await deleteStoredRepoWebhook(db, repo);
  removeRepo(db, repo.id);
  recordDiagnosticEventSafely(db, {
    level: "info",
    event: "repo.removed",
    source: "cli",
    owner,
    repo: name,
    message: "Repository removed from issuectl",
    data: { repoId: repo.id, hookId: repo.webhookId, affectedSessionIds: [...endedIssueSessionIds, ...endedPrSessionIds] },
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
  webhook?: boolean | string;
  autoLaunchIssues?: boolean | string;
  autoReviewPrs?: boolean | string;
  issueAgent?: LaunchAgent | string;
  reviewAgent?: LaunchAgent | string;
  webhookPayloadMode?: WebhookPayloadMode | string;
  webhookBaseUrl?: string;
};

type RepoSetupOctokit = {
  rest: {
    issues: {
      getLabel(input: { owner: string; repo: string; name: string }): Promise<unknown>;
      createLabel(input: { owner: string; repo: string; name: string; color: string; description: string }): Promise<unknown>;
    };
    repos: {
      deleteWebhook(input: { owner: string; repo: string; hook_id: number }): Promise<unknown>;
    };
  };
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
  const webhook = normalizeOptionalBoolean(options.webhook, "--webhook");
  const shouldPromptForAutomation = webhook !== false;
  const autoLaunchIssues = options.autoLaunchIssues === undefined
    ? shouldPromptForAutomation
      ? await confirm({
        message: "Auto-launch issue sessions from webhooks?",
        default: false,
      })
      : false
    : normalizeOptionalBoolean(options.autoLaunchIssues, "--auto-launch-issues");
  const autoReviewPrs = options.autoReviewPrs === undefined
    ? shouldPromptForAutomation
      ? await confirm({
        message: "Reserve PRs for automatic review from webhooks?",
        default: false,
      })
      : false
    : normalizeOptionalBoolean(options.autoReviewPrs, "--auto-review-prs");
  const automationEnabled = autoLaunchIssues || autoReviewPrs;
  const shouldConfigureWebhook = webhook !== false && (webhook === true || automationEnabled);

  let issueAgent = normalizeOptionalAgent(options.issueAgent, "--issue-agent");
  if (autoLaunchIssues && issueAgent === undefined) {
    issueAgent = await promptLaunchAgent("Issue session agent", "claude");
  }

  let reviewAgent = normalizeOptionalAgent(options.reviewAgent, "--review-agent");
  if (autoReviewPrs && reviewAgent === undefined) {
    reviewAgent = await promptLaunchAgent("PR review agent", "claude");
  }

  let webhookPayloadMode = normalizeOptionalPayloadMode(options.webhookPayloadMode);
  if (automationEnabled && webhookPayloadMode === undefined) {
    webhookPayloadMode = await promptWebhookPayloadMode();
  }

  let webhookBaseUrl = options.webhookBaseUrl;
  if (shouldConfigureWebhook && webhookBaseUrl === undefined) {
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

  if (shouldConfigureWebhook) {
    runRepoAddPreflight(webhookBaseUrl);
  }

  return {
    ...options,
    webhook,
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
  const webhookSetup = normalizeOptionalBoolean(options.webhook, "--webhook");
  if (!issueAutomation && !reviewAutomation && webhookSetup !== true) return;

  log.info(`Webhook settings saved for ${owner}/${name}.`);
  if (!options.webhookBaseUrl) {
    log.info(`Open repo settings or run \`issuectl webhook create ${owner}/${name}\` to finish GitHub installation.`);
  }
}

async function installRepoWebhookIfReady(
  db: ReturnType<typeof requireDb>,
  repo: { id: number; owner: string; name: string },
  options: RepoCommandOptions,
): Promise<void> {
  const webhookSetup = normalizeOptionalBoolean(options.webhook, "--webhook");
  if (webhookSetup === false) return;
  const labels = automationLabels(options);
  if (labels.length === 0 && webhookSetup !== true) return;
  if (!options.webhookBaseUrl) return;

  const url = `${normalizeWebhookBaseUrl(options.webhookBaseUrl)}/api/webhook/github/${repo.id}`;
  const secret = randomBytes(32).toString("hex");
  try {
    const created = await withAuthRetry(async (octokit) => {
      const webhook = await createIssuectlWebhook(octokit, {
        owner: repo.owner,
        repo: repo.name,
        url,
        secret,
      });
      await Promise.all(labels.map((label) =>
        ensureRepoLabel(octokit as RepoSetupOctokit, repo.owner, repo.name, label),
      ));
      return webhook;
    });
    updateRepoWebhookSettings(db, repo.id, {
      webhookId: created.id,
      webhookSecret: secret,
    });
    const firstPing = await waitForFirstPing(db, repo.id, 5_000);
    if (firstPing === "timeout") {
      log.warn("Webhook installed, but no first delivery arrived before the timeout.");
    }
    log.success(`Installed GitHub webhook ${created.id} for ${repo.owner}/${repo.name}`);
  } catch (err) {
    log.warn(`Webhook install failed: ${formatErrorForUser(err)}`);
  }
}

function automationLabels(options: RepoCommandOptions): Array<"issuectl:auto-launch" | "issuectl:auto-review"> {
  return [
    ...(normalizeOptionalBoolean(options.autoLaunchIssues, "--auto-launch-issues") ? ["issuectl:auto-launch" as const] : []),
    ...(normalizeOptionalBoolean(options.autoReviewPrs, "--auto-review-prs") ? ["issuectl:auto-review" as const] : []),
  ];
}

async function ensureRepoLabel(
  octokit: RepoSetupOctokit,
  owner: string,
  repo: string,
  name: "issuectl:auto-launch" | "issuectl:auto-review",
): Promise<void> {
  const meta = name === "issuectl:auto-launch"
    ? { color: "2f81f7", description: "Opt issue into issuectl auto-launch" }
    : { color: "a371f7", description: "Opt PR into issuectl auto-review" };
  try {
    await octokit.rest.issues.getLabel({ owner, repo, name });
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
    try {
      await octokit.rest.issues.createLabel({ owner, repo, name, ...meta });
    } catch (createErr) {
      if ((createErr as { status?: number }).status !== 422) throw createErr;
    }
  }
}

async function waitForFirstPing(
  db: ReturnType<typeof requireDb>,
  repoId: number,
  timeoutMs: number,
): Promise<"received" | "timeout"> {
  if (hasPingDelivery(db, repoId)) return "received";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 250));
    if (hasPingDelivery(db, repoId)) return "received";
  }
  return "timeout";
}

function hasPingDelivery(db: ReturnType<typeof requireDb>, repoId: number): boolean {
  return listWebhookEvents(db, { limit: 50, repoId }).some((event) => event.eventType === "ping");
}

async function deleteStoredRepoWebhook(
  db: ReturnType<typeof requireDb>,
  repo: { id: number; owner: string; name: string; webhookId: number | null },
): Promise<void> {
  if (!repo.webhookId) return;
  try {
    await withAuthRetry((octokit) =>
      (octokit as RepoSetupOctokit).rest.repos.deleteWebhook({
        owner: repo.owner,
        repo: repo.name,
        hook_id: repo.webhookId ?? 0,
      }),
    );
  } catch (err) {
    log.warn(`Failed to delete GitHub webhook ${repo.webhookId}: ${formatErrorForUser(err)}`);
    recordDiagnosticEventSafely(db, {
      level: "warn",
      event: "repo.webhook_delete_failed",
      source: "cli",
      owner: repo.owner,
      repo: repo.name,
      message: formatErrorForUser(err),
      data: { repoId: repo.id, hookId: repo.webhookId },
    });
  }
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
    const transition = transitionDeploymentTerminal(db, deployment.id, "killed_by_label");
    if (!transition.changed) continue;
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

"use server";

/* eslint-disable max-lines */
import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  getDb,
  addRepo as coreAddRepo,
  createIssuectlWebhook,
  removeRepo as coreRemoveRepo,
  updateRepo as coreUpdateRepo,
  updateRepoWebhookSettings,
  getRepoById,
  getSetting,
  getActiveWebhookDeploymentsForRepoTarget,
  markActivePrReviewForDeploymentTerminal,
  killTtyd,
  killTmuxSession,
  tmuxSessionName,
  recordDiagnosticEventSafely,
  readCachedAccessibleRepos,
  refreshAccessibleRepos,
  getIssues,
  getPulls,
  listWebhookEvents,
  listLabels,
  rotateIssuectlWebhook,
  withAuthRetry,
  formatErrorForUser,
  type AccessibleReposSnapshot,
  type LaunchAgent,
  type WebhookPayloadMode,
} from "@issuectl/core";
import { revalidateSafely } from "@/lib/revalidate";
import { notifyDeploymentTerminalOutcome } from "@/lib/push/notifications";

function expandHome(p: string): string {
  return p.startsWith("~") ? p.replace("~", homedir()) : p;
}

function transitionDeploymentTerminal(
  db: ReturnType<typeof getDb>,
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

function errMessage(err: unknown): unknown {
  return err instanceof Error ? err.message : err;
}

export type AddRepoResult =
  | {
      success: true;
      addedRepo: { id: number; owner: string; name: string };
      install: AddRepoInstallResult;
      warning?: string;
      cacheStale?: true;
    }
  | { success: false; error: string };

export type AddRepoInstallResult = {
  webhook: "installed" | "skipped" | "failed";
  labels: Array<"issuectl:auto-launch" | "issuectl:auto-review">;
  firstPing: "received" | "timeout" | "skipped";
  webhookId?: number;
  url?: string;
  createdBy?: string;
};

export type AddRepoOptions = {
  autoLaunchIssues?: boolean;
  autoReviewPrs?: boolean;
  issueAgent?: LaunchAgent;
  reviewAgent?: LaunchAgent;
  reviewPreamble?: string | null;
  webhookPayloadMode?: WebhookPayloadMode;
  installWebhook?: boolean;
  firstPingTimeoutMs?: number;
};

export async function verifyRepoAccess(
  owner: string,
  name: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!owner || !name) {
    return { success: false, error: "Owner and repo name are required" };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { success: false, error: "Invalid owner/repo format" };
  }

  try {
    await withAuthRetry((octokit) =>
      octokit.rest.repos.get({ owner, repo: name }),
    );
    return { success: true };
  } catch (err) {
    console.error("[issuectl] Failed to verify repo from GitHub:", errMessage(err));
    return {
      success: false,
      error: `Cannot verify ${owner}/${name}: ${formatErrorForUser(err)}. If this is a private repo, run gh auth refresh -s repo -s admin:repo_hook.`,
    };
  }
}

export async function addRepo(
  owner: string,
  name: string,
  localPath?: string,
  options: AddRepoOptions = {},
): Promise<AddRepoResult> {
  if (!owner || !name) {
    return { success: false, error: "Owner and repo name are required" };
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(name)) {
    return { success: false, error: "Invalid owner/repo format" };
  }

  try {
    await withAuthRetry((octokit) =>
      octokit.rest.repos.get({ owner, repo: name }),
    );
  } catch (err) {
    console.error("[issuectl] Failed to fetch repo from GitHub:", errMessage(err));
    return {
      success: false,
      error: `Repository ${owner}/${name} not found on GitHub: ${formatErrorForUser(err)}`,
    };
  }

  let addedRepo: { id: number; owner: string; name: string };
  let install: AddRepoInstallResult = {
    webhook: "skipped",
    labels: [],
    firstPing: "skipped",
  };
  let installWarning: string | undefined;
  try {
    const db = getDb();
    const repo = coreAddRepo(db, { owner, name, localPath });
    addedRepo = { id: repo.id, owner: repo.owner, name: repo.name };
    const webhookUpdates = {
      autoLaunchIssues: options.autoLaunchIssues,
      autoReviewPrs: options.autoReviewPrs,
      issueAgent: options.issueAgent,
      reviewAgent: options.reviewAgent,
      reviewPreamble: options.reviewPreamble,
      webhookPayloadMode: options.webhookPayloadMode,
    };
    if (Object.values(webhookUpdates).some((value) => value !== undefined)) {
      updateRepoWebhookSettings(db, repo.id, webhookUpdates);
    }
    if (options.installWebhook) {
      const result = await installRepoAutomation(db, repo.id, owner, name, options);
      install = result.install;
      installWarning = result.warning;
    }
  } catch (err) {
    console.error("[issuectl] Failed to add repo:", errMessage(err));
    const msg =
      err instanceof Error && err.message.includes("UNIQUE")
        ? "Repository already tracked"
        : "Failed to add repository";
    return { success: false, error: msg };
  }

  // Fire-and-forget: warm caches in the background so the dashboard is
  // pre-populated, but don't block the response. If warming hasn't
  // finished by the time the user visits the dashboard, the async
  // Server Component fetches from GitHub directly (slower first load,
  // but functionally correct).
  withAuthRetry(async (octokit) => {
    const db = getDb();
    await Promise.all([
      getIssues(db, octokit, owner, name).catch((err) => {
        console.warn(
          `[issuectl] Warm getIssues failed for ${owner}/${name}:`,
          errMessage(err),
        );
      }),
      getPulls(db, octokit, owner, name).catch((err) => {
        console.warn(
          `[issuectl] Warm getPulls failed for ${owner}/${name}:`,
          errMessage(err),
        );
      }),
      listLabels(octokit, owner, name).catch((err) => {
        console.warn(
          `[issuectl] Warm listLabels failed for ${owner}/${name}:`,
          errMessage(err),
        );
      }),
    ]);
  }).catch((err) => {
    console.error(
      `[issuectl] Warm sync failed for ${owner}/${name}:`,
      errMessage(err),
    );
  });

  const { stale } = revalidateSafely(
    "/settings",
    "/settings/repos",
    `/repos/${owner}/${name}/settings`,
    "/",
  );

  if (localPath) {
    const exists = await stat(expandHome(localPath)).catch(() => null);
    if (!exists) {
      return {
        success: true,
        addedRepo,
        install,
        warning: "Local path does not exist — will prompt to clone on launch",
        ...(stale ? { cacheStale: true as const } : {}),
      };
    }
  }

  return {
    success: true,
    addedRepo,
    install,
    ...(installWarning ? { warning: installWarning } : {}),
    ...(stale ? { cacheStale: true as const } : {}),
  };
}

async function installRepoAutomation(
  db: ReturnType<typeof getDb>,
  repoId: number,
  owner: string,
  name: string,
  options: AddRepoOptions,
): Promise<{ install: AddRepoInstallResult; warning?: string }> {
  const labels = automationLabels(options);
  const baseUrl = getSetting(db, "public_webhook_base_url");
  if (!baseUrl) {
    return {
      install: { webhook: "skipped", labels: [], firstPing: "skipped" },
      warning: "Webhook install skipped: public webhook base URL is not configured.",
    };
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/webhook/github/${repoId}`;
  const secret = randomBytes(32).toString("hex");
  try {
    const webhook = await withAuthRetry(async (octokit) => {
      const created = await createIssuectlWebhook(octokit, {
        owner,
        repo: name,
        url,
        secret,
      });
      await Promise.all(labels.map((label) => ensureRepoLabel(octokit, owner, name, label)));
      return created;
    });
    updateRepoWebhookSettings(db, repoId, {
      webhookId: webhook.id,
      webhookSecret: secret,
    });
    const firstPing = await waitForFirstPing(db, repoId, options.firstPingTimeoutMs ?? 5_000);
    return {
      install: {
        webhook: "installed",
        labels,
        firstPing,
        webhookId: webhook.id,
        url,
        createdBy: webhook.createdBy,
      },
      ...(firstPing === "timeout" ? { warning: "Webhook installed, but no first delivery arrived before the timeout." } : {}),
    };
  } catch (err) {
    console.error("[issuectl] Webhook install failed:", errMessage(err));
    return {
      install: { webhook: "failed", labels: [], firstPing: "skipped", url },
      warning: `Webhook install failed: ${formatErrorForUser(err)}`,
    };
  }
}

function automationLabels(options: AddRepoOptions): Array<"issuectl:auto-launch" | "issuectl:auto-review"> {
  return [
    ...(options.autoLaunchIssues ? ["issuectl:auto-launch" as const] : []),
    ...(options.autoReviewPrs ? ["issuectl:auto-review" as const] : []),
  ];
}

async function ensureRepoLabel(
  octokit: Parameters<Parameters<typeof withAuthRetry>[0]>[0],
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
  db: ReturnType<typeof getDb>,
  repoId: number,
  timeoutMs: number,
): Promise<"received" | "timeout"> {
  if (hasPingDelivery(db, repoId)) return "received";
  if (timeoutMs <= 0) return "timeout";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolveTimer) => setTimeout(resolveTimer, 250));
    if (hasPingDelivery(db, repoId)) return "received";
  }
  return "timeout";
}

function hasPingDelivery(db: ReturnType<typeof getDb>, repoId: number): boolean {
  return listWebhookEvents(db, 50).some((event) =>
    event.repoId === repoId && event.eventType === "ping",
  );
}

export async function removeRepo(
  id: number,
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (!id || id <= 0) {
    return { success: false, error: "Invalid repo ID" };
  }

  try {
    const db = getDb();
    const repo = getRepoById(db, id);
    if (!repo) return { success: false, error: "Repository not found" };
    const endedIssueSessionIds = endActiveWebhookDeployments(db, id, repo.name, "issue", "killed_by_label");
    const endedPrSessionIds = endActiveWebhookDeployments(db, id, repo.name, "pr", "killed_by_label");
    await deleteRepoWebhook(repo).catch((err) => {
      console.warn("[issuectl] Failed to delete repo webhook:", errMessage(err));
      recordDiagnosticEventSafely(db, {
        level: "warn",
        event: "repo.webhook_delete_failed",
        source: "web",
        owner: repo.owner,
        repo: repo.name,
        message: formatErrorForUser(err),
        data: { repoId: id, hookId: repo.webhookId },
      });
    });
    coreRemoveRepo(db, id);
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: "repo.removed",
      source: "web",
      owner: repo.owner,
      repo: repo.name,
      message: "Repository removed from issuectl",
      data: { repoId: id, hookId: repo.webhookId, affectedSessionIds: [...endedIssueSessionIds, ...endedPrSessionIds] },
    });
  } catch (err) {
    console.error("[issuectl] Failed to remove repo:", errMessage(err));
    return { success: false, error: "Failed to remove repository" };
  }
  const { stale } = revalidateSafely("/settings", "/");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function getGithubReposAction(): Promise<
  | { success: true; snapshot: AccessibleReposSnapshot }
  | { success: false; error: string }
> {
  try {
    const db = getDb();
    return { success: true, snapshot: readCachedAccessibleRepos(db) };
  } catch (err) {
    console.error("[issuectl] readCachedAccessibleRepos failed:", errMessage(err));
    return { success: false, error: formatErrorForUser(err) };
  }
}

export async function refreshGithubReposAction(): Promise<
  | { success: true; snapshot: AccessibleReposSnapshot }
  | { success: false; error: string }
> {
  try {
    const db = getDb();
    const snapshot = await withAuthRetry((octokit) =>
      refreshAccessibleRepos(db, octokit),
    );
    return { success: true, snapshot };
  } catch (err) {
    console.error(
      "[issuectl] refreshAccessibleRepos failed:",
      errMessage(err),
    );
    return { success: false, error: formatErrorForUser(err) };
  }
}

export async function updateRepo(
  id: number,
  updates: {
    localPath?: string;
    branchPattern?: string;
    autoLaunchIssues?: boolean;
    autoReviewPrs?: boolean;
    issueAgent?: LaunchAgent;
    reviewAgent?: LaunchAgent;
    reviewPreamble?: string | null;
    webhookPayloadMode?: WebhookPayloadMode;
  },
): Promise<{ success: boolean; error?: string; cacheStale?: true }> {
  if (!id || id <= 0) {
    return { success: false, error: "Invalid repo ID" };
  }

  if (updates.localPath !== undefined && updates.localPath !== "") {
    const lp = updates.localPath.trim();
    if (!lp.startsWith("/") && !lp.startsWith("~")) {
      return { success: false, error: "Local path must be absolute (start with / or ~)" };
    }
    const home = homedir();
    let expanded: string;
    if (lp.startsWith("~/")) {
      expanded = home + lp.slice(1);
    } else if (lp === "~") {
      expanded = home;
    } else {
      expanded = lp;
    }
    const resolved = resolve(expanded);
    try {
      const dirStat = await stat(resolved);
      if (!dirStat.isDirectory()) {
        return { success: false, error: "Local path is not a directory" };
      }
    } catch {
      return { success: false, error: "Local path does not exist or is not accessible" };
    }
    try {
      await stat(resolve(resolved, ".git"));
    } catch {
      return { success: false, error: "Local path does not appear to be a git repository (no .git directory)" };
    }
  }

  try {
    const db = getDb();
    const repoUpdates = {
      localPath: updates.localPath,
      branchPattern: updates.branchPattern,
    };
    if (Object.values(repoUpdates).some((value) => value !== undefined)) {
      coreUpdateRepo(db, id, repoUpdates);
    }
    const webhookUpdates = {
      autoLaunchIssues: updates.autoLaunchIssues,
      autoReviewPrs: updates.autoReviewPrs,
      issueAgent: updates.issueAgent,
      reviewAgent: updates.reviewAgent,
      reviewPreamble: updates.reviewPreamble,
      webhookPayloadMode: updates.webhookPayloadMode,
    };
    if (Object.values(webhookUpdates).some((value) => value !== undefined)) {
      const previous = getRepoById(db, id);
      updateRepoWebhookSettings(db, id, webhookUpdates);
      const endedSessionIds = endDisabledAutomationSessions(db, id, previous, webhookUpdates);
      recordRepoSettingsDiagnostics(db, id, previous, webhookUpdates, endedSessionIds);
    }
  } catch (err) {
    console.error("[issuectl] Failed to update repo:", errMessage(err));
    return { success: false, error: "Failed to update repository" };
  }
  const { stale } = revalidateSafely("/settings");
  return { success: true, ...(stale ? { cacheStale: true as const } : {}) };
}

export async function configureRepoWebhook(
  id: number,
  action: "rotate" | "reinstall",
): Promise<{
  success: true;
  webhook: { id: number; url: string; createdBy: string };
} | { success: false; error: string }> {
  try {
    const db = getDb();
    const repo = getRepoById(db, id);
    if (!repo) return { success: false, error: "Repository not found" };
    const url = repoWebhookUrl(db, id);
    const secret = randomBytes(32).toString("hex");
    const webhook = await withAuthRetry(async (octokit) => {
      if (repo.webhookId) {
        try {
          return await rotateIssuectlWebhook(octokit, {
            owner: repo.owner,
            repo: repo.name,
            hookId: repo.webhookId,
            url,
            secret,
          });
        } catch (err) {
          if (action !== "reinstall" || (err as { status?: number }).status !== 404) throw err;
        }
      }
      return createIssuectlWebhook(octokit, {
        owner: repo.owner,
        repo: repo.name,
        url,
        secret,
      });
    });
    updateRepoWebhookSettings(db, id, {
      webhookId: webhook.id,
      webhookSecret: secret,
    });
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: action === "rotate" ? "repo.webhook_secret_rotated" : "repo.webhook_reinstalled",
      source: "web",
      owner: repo.owner,
      repo: repo.name,
      message: action === "rotate" ? "Repository webhook secret rotated" : "Repository webhook reinstalled",
      data: { repoId: id, hookId: webhook.id, url },
    });
    return { success: true, webhook: { id: webhook.id, url, createdBy: webhook.createdBy } };
  } catch (err) {
    return { success: false, error: formatErrorForUser(err) };
  }
}

export async function recreateRepoLabels(
  id: number,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const db = getDb();
    const repo = getRepoById(db, id);
    if (!repo) return { success: false, error: "Repository not found" };
    await withAuthRetry(async (octokit) => {
      await Promise.all([
        ensureRepoLabel(octokit, repo.owner, repo.name, "issuectl:auto-launch"),
        ensureRepoLabel(octokit, repo.owner, repo.name, "issuectl:auto-review"),
      ]);
    });
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: "repo.label_recreated",
      source: "web",
      owner: repo.owner,
      repo: repo.name,
      message: "Repository automation labels recreated",
      data: { repoId: id },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: formatErrorForUser(err) };
  }
}

export async function resendLastPing(
  id: number,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const db = getDb();
    const repo = getRepoById(db, id);
    if (!repo) return { success: false, error: "Repository not found" };
    if (!repo.webhookId) return { success: false, error: "No webhook id is stored for this repo" };
    await withAuthRetry((octokit) =>
      octokit.rest.repos.pingWebhook({
        owner: repo.owner,
        repo: repo.name,
        hook_id: repo.webhookId ?? 0,
      }),
    );
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: "repo.webhook_ping_sent",
      source: "web",
      owner: repo.owner,
      repo: repo.name,
      message: "Repository webhook ping resent",
      data: { repoId: id, hookId: repo.webhookId },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: formatErrorForUser(err) };
  }
}

function repoWebhookUrl(db: ReturnType<typeof getDb>, repoId: number): string {
  const baseUrl = getSetting(db, "public_webhook_base_url");
  if (!baseUrl) throw new Error("public_webhook_base_url is not configured.");
  return `${baseUrl.replace(/\/$/, "")}/api/webhook/github/${repoId}`;
}

async function deleteRepoWebhook(repo: { owner: string; name: string; webhookId: number | null }): Promise<void> {
  if (!repo.webhookId) return;
  await withAuthRetry((octokit) =>
    octokit.rest.repos.deleteWebhook({
      owner: repo.owner,
      repo: repo.name,
      hook_id: repo.webhookId ?? 0,
    }),
  );
}

function recordRepoSettingsDiagnostics(
  db: ReturnType<typeof getDb>,
  repoId: number,
  previous: { owner: string; name: string; autoLaunchIssues: boolean; autoReviewPrs: boolean } | undefined,
  updates: { autoLaunchIssues?: boolean; autoReviewPrs?: boolean },
  affectedSessionIds: { issue: number[]; pr: number[] } = { issue: [], pr: [] },
): void {
  if (!previous) return;
  if (updates.autoLaunchIssues !== undefined && updates.autoLaunchIssues !== previous.autoLaunchIssues) {
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: updates.autoLaunchIssues ? "repo.automation_enabled" : "repo.automation_disabled",
      source: "web",
      owner: previous.owner,
      repo: previous.name,
      message: updates.autoLaunchIssues ? "Issue auto-launch enabled" : "Issue auto-launch disabled",
      data: { repoId, targetType: "issue", affectedSessionIds: affectedSessionIds.issue },
    });
  }
  if (updates.autoReviewPrs !== undefined && updates.autoReviewPrs !== previous.autoReviewPrs) {
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: updates.autoReviewPrs ? "repo.automation_enabled" : "repo.automation_disabled",
      source: "web",
      owner: previous.owner,
      repo: previous.name,
      message: updates.autoReviewPrs ? "PR auto-review enabled" : "PR auto-review disabled",
      data: { repoId, targetType: "pr", affectedSessionIds: affectedSessionIds.pr },
    });
  }
}

function endDisabledAutomationSessions(
  db: ReturnType<typeof getDb>,
  repoId: number,
  previous: { name: string; autoLaunchIssues: boolean; autoReviewPrs: boolean } | undefined,
  updates: { autoLaunchIssues?: boolean; autoReviewPrs?: boolean },
): { issue: number[]; pr: number[] } {
  const ended = { issue: [] as number[], pr: [] as number[] };
  if (!previous) return ended;
  if (previous.autoLaunchIssues && updates.autoLaunchIssues === false) {
    ended.issue = endActiveWebhookDeployments(db, repoId, previous.name, "issue", "killed_by_label");
  }
  if (previous.autoReviewPrs && updates.autoReviewPrs === false) {
    ended.pr = endActiveWebhookDeployments(db, repoId, previous.name, "pr", "killed_by_label");
  }
  return ended;
}

function endActiveWebhookDeployments(
  db: ReturnType<typeof getDb>,
  repoId: number,
  repoName: string,
  targetType: "issue" | "pr",
  terminalReason: "killed_by_label",
): number[] {
  const endedSessionIds: number[] = [];
  for (const deployment of getActiveWebhookDeploymentsForRepoTarget(db, repoId, targetType)) {
    const sessionName = tmuxSessionName(repoName, deployment.targetNumber, targetType);
    if (deployment.ttydPid) killTtyd(deployment.ttydPid, sessionName);
    else if (deployment.terminalBackend === "pty_bridge") killTmuxSession(sessionName);
    const transition = transitionDeploymentTerminal(db, deployment.id, terminalReason);
    if (!transition.changed) continue;
    if (targetType === "pr") {
      markActivePrReviewForDeploymentTerminal(db, deployment.id, {
        completedAt: Date.now(),
        status: "superseded",
        reason: terminalReason,
      });
    }
    notifyDeploymentTerminalOutcome({ deploymentId: deployment.id });
    endedSessionIds.push(deployment.id);
  }
  return endedSessionIds;
}

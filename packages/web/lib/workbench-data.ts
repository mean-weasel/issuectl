import log from "@/lib/logger";
import { getSessionPreviews } from "@/lib/session-previews";
import type {
  WorkbenchHealth,
  WorkbenchIssueSummary,
  WorkbenchPayload,
  WorkbenchPreview,
  WorkbenchRepo,
  WorkbenchSettings,
  WorkbenchUser,
} from "@/components/workbench/workbench-types";
import {
  DEFAULT_REPO_FANOUT,
  checkGhAuth,
  formatErrorForUser,
  getActiveDeployments,
  getDb,
  getIssues,
  getSettings,
  listPrReviewsForRepo,
  listPrioritiesForRepo,
  listRecentTerminalDeploymentsByRepo,
  listRepos,
  listWebhookEvents,
  mapLimit,
  withAuthRetry,
  type ActiveDeploymentWithRepo,
  type GitHubIssue,
  type IssuePriority,
  type Repo,
  type SettingKey,
} from "@issuectl/core";

const WORKBENCH_SETTING_KEYS: readonly Exclude<SettingKey, "api_token">[] = [
  "branch_pattern",
  "cache_ttl",
  "worktree_dir",
  "launch_agent",
  "terminal_backend",
  "claude_extra_args",
  "codex_extra_args",
  "default_repo_id",
  "idle_grace_period",
  "idle_threshold",
  "public_webhook_base_url",
];

const PREVIEW_STATUS_RANK: Record<WorkbenchPreview["status"], number> = {
  active: 0,
  error: 1,
  unavailable: 2,
  idle: 3,
};

export async function getWorkbenchPayload({
  includeUser = true,
}: {
  includeUser?: boolean;
} = {}): Promise<WorkbenchPayload> {
  const db = getDb();
  const repos = listRepos(db);
  const activeDeployments = getActiveDeployments(db).filter(isActiveDeployment);
  const previews = await getSessionPreviews(activeDeployments);
  const settings = readWorkbenchSettings(db);
  const [user, workbenchRepos] = await Promise.all([
    includeUser ? readCurrentUser() : Promise.resolve({ login: null, error: null }),
    readWorkbenchRepos(db, repos, activeDeployments, previews, settings),
  ]);

  return {
    repos: workbenchRepos,
    deployments: activeDeployments,
    previews,
    settings,
    health: readHealth(),
    user,
    generatedAt: new Date().toISOString(),
  };
}

function readWorkbenchSettings(db: unknown): WorkbenchSettings {
  const allowed = new Set<string>(WORKBENCH_SETTING_KEYS);
  const settings = Object.fromEntries(
    getSettings(db as Parameters<typeof getSettings>[0])
      .filter((setting) => allowed.has(setting.key))
      .map((setting) => [setting.key, setting.value]),
  ) as WorkbenchSettings;
  return {
    ...settings,
    terminal_backend: process.env.ISSUECTL_PTY_BRIDGE === "1"
      ? "pty_bridge"
      : settings.terminal_backend ?? "ttyd",
  };
}

async function readCurrentUser(): Promise<WorkbenchUser> {
  try {
    const status = await checkGhAuth();
    if (status.ok && status.username) {
      return { login: status.username, error: null };
    }
    return { login: null, error: status.error ?? "GitHub user unavailable" };
  } catch (err) {
    log.warn({ err, msg: "api_workbench_user_failed" });
    return { login: null, error: formatErrorForUser(err) };
  }
}

function readHealth(): WorkbenchHealth {
  return {
    ok: true,
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
    timestamp: new Date().toISOString(),
    error: null,
  };
}

async function readWorkbenchRepos(
  db: Parameters<typeof listRepos>[0],
  repos: Repo[],
  deployments: ActiveDeploymentWithRepo[],
  previews: Record<string, WorkbenchPreview>,
  settings: WorkbenchSettings,
): Promise<WorkbenchRepo[]> {
  return mapLimit(repos, DEFAULT_REPO_FANOUT, async (repo) => {
    const repoDeployments = sortDeploymentsByRunningState(
      deployments.filter((deployment) => deployment.repoId === repo.id),
      previews,
    );
    const priorities = listPrioritiesForRepo(db, repo.id);
    const recentCompletions = listRecentTerminalDeploymentsByRepo(db, repo.id, 5);
    const webhookEvents = listWebhookEvents(db, { repoId: repo.id, limit: 8 });
    const prReviews = listPrReviewsForRepo(db, repo.id, 8);
    const repoPreviews = previewsForDeployments(repoDeployments, previews);

    try {
      const issuesResult = await withAuthRetry((octokit) =>
        getIssues(db, octokit, repo.owner, repo.name, { forceRefresh: false }),
      );
      return buildWorkbenchRepo({
        repo,
        terminalBackendDefault: terminalBackendDefault(settings),
        repoDeployments,
        recentCompletions,
        webhookEvents,
        prReviews,
        priorities,
        repoPreviews,
        issues: issuesResult.issues,
        issuesFromCache: issuesResult.fromCache,
        issuesCachedAt: formatNullableDate(issuesResult.cachedAt),
        issueError: null,
      });
    } catch (err) {
      log.warn({
        err,
        msg: "api_workbench_repo_issues_failed",
        owner: repo.owner,
        repo: repo.name,
      });
      return buildWorkbenchRepo({
        repo,
        terminalBackendDefault: terminalBackendDefault(settings),
        repoDeployments,
        recentCompletions,
        webhookEvents,
        prReviews,
        priorities,
        repoPreviews,
        issues: [],
        issuesFromCache: false,
        issuesCachedAt: null,
        issueError: formatErrorForUser(err),
      });
    }
  });
}

function sortDeploymentsByRunningState(
  deployments: ActiveDeploymentWithRepo[],
  previews: Record<string, WorkbenchPreview>,
): ActiveDeploymentWithRepo[] {
  return [...deployments].sort((left, right) =>
    previewRank(left, previews) - previewRank(right, previews)
    || Date.parse(right.launchedAt) - Date.parse(left.launchedAt)
    || left.targetNumber - right.targetNumber
    || left.id - right.id,
  );
}

function previewRank(
  deployment: ActiveDeploymentWithRepo,
  previews: Record<string, WorkbenchPreview>,
): number {
  if (deployment.ttydPort === null) return PREVIEW_STATUS_RANK.unavailable;
  return PREVIEW_STATUS_RANK[previews[String(deployment.ttydPort)]?.status ?? "unavailable"];
}

function buildWorkbenchRepo(input: {
  repo: Repo;
  terminalBackendDefault: WorkbenchRepo["terminalBackendDefault"];
  repoDeployments: ActiveDeploymentWithRepo[];
  recentCompletions: WorkbenchRepo["recentCompletions"];
  webhookEvents: WorkbenchRepo["webhookEvents"];
  prReviews: WorkbenchRepo["prReviews"];
  priorities: IssuePriority[];
  repoPreviews: Record<string, WorkbenchPreview>;
  issues: GitHubIssue[];
  issuesFromCache: boolean;
  issuesCachedAt: string | null;
  issueError: string | null;
}): WorkbenchRepo {
  const activeIssueNumbers = new Set(
    input.repoDeployments
      .filter((deployment) => deployment.targetType === "issue" && deployment.issueNumber !== null)
      .map((deployment) => deployment.issueNumber as number),
  );
  const priorityByIssue = new Map(
    input.priorities.map((priority) => [priority.issueNumber, priority.priority]),
  );
  return {
    id: input.repo.id,
    owner: input.repo.owner,
    name: input.repo.name,
    localPath: input.repo.localPath,
    branchPattern: input.repo.branchPattern,
    autoLaunchIssues: input.repo.autoLaunchIssues,
    autoReviewPrs: input.repo.autoReviewPrs,
    issueAgent: input.repo.issueAgent,
    reviewAgent: input.repo.reviewAgent,
    webhookId: input.repo.webhookId,
    webhookPayloadMode: input.repo.webhookPayloadMode,
    badgeCount: input.repoDeployments.length,
    deployedCount: input.repoDeployments.length,
    launchAgent: input.repoDeployments[0]?.agent ?? null,
    terminalBackendDefault: input.terminalBackendDefault,
    issueError: input.issueError,
    issuesFromCache: input.issuesFromCache,
    issuesCachedAt: input.issuesCachedAt,
    priorities: input.priorities,
    deployments: input.repoDeployments,
    recentCompletions: input.recentCompletions,
    webhookEvents: input.webhookEvents,
    prReviews: input.prReviews,
    previews: input.repoPreviews,
    issues: input.issues.map((issue) =>
      summarizeIssue(issue, priorityByIssue.get(issue.number) ?? "normal", activeIssueNumbers),
    ),
  };
}

function terminalBackendDefault(settings: WorkbenchSettings): WorkbenchRepo["terminalBackendDefault"] {
  return settings.terminal_backend === "pty_bridge" ? "pty_bridge" : "ttyd";
}

function summarizeIssue(
  issue: GitHubIssue,
  priority: WorkbenchIssueSummary["priority"],
  activeIssueNumbers: Set<number>,
): WorkbenchIssueSummary {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: issue.labels.map((label) => label.name),
    updatedAt: issue.updatedAt,
    priority,
    hasActiveDeployment: activeIssueNumbers.has(issue.number),
    htmlUrl: issue.htmlUrl,
    authorLogin: issue.user?.login ?? null,
  };
}

function previewsForDeployments(
  deployments: ActiveDeploymentWithRepo[],
  previews: Record<string, WorkbenchPreview>,
): Record<string, WorkbenchPreview> {
  return Object.fromEntries(
    deployments
      .map((deployment) => deployment.ttydPort)
      .filter((port): port is number => port !== null)
      .map((port) => [String(port), previews[String(port)]])
      .filter((entry): entry is [string, WorkbenchPreview] => entry[1] !== undefined),
  );
}

function isActiveDeployment(deployment: ActiveDeploymentWithRepo): boolean {
  return deployment.state === "active" && deployment.endedAt === null;
}

function formatNullableDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

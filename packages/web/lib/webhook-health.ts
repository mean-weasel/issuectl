import { getSetting, withAuthRetry, type Repo } from "@issuectl/core";
import { buildWebhookUrl } from "@/lib/webhook-url-reconciler";

type Db = Parameters<typeof getSetting>[0];

export type WebhookAutomationHealthState = "ok" | "warning" | "error" | "unknown";

export type WebhookAutomationHealth = {
  state: WebhookAutomationHealthState;
  summary: string;
  detail: string;
  recovery: string | null;
  expectedUrl: string | null;
  hookId: number | null;
  githubUrl: string | null;
  latestDelivery: {
    event: string | null;
    action: string | null;
    statusCode: number | null;
    deliveredAt: string | null;
  } | null;
};

type GitHubDelivery = {
  event?: string | null;
  action?: string | null;
  status_code?: number | null;
  delivered_at?: string | null;
};

type GitHubHookSnapshot = {
  active: boolean | null;
  url: string | null;
  deliveries: GitHubDelivery[];
};

type WebhookHealthDependencies = {
  getBaseUrl: (db: Db) => string | undefined;
  inspectGitHubHook: (repo: Repo) => Promise<GitHubHookSnapshot>;
};

const defaultDependencies: WebhookHealthDependencies = {
  getBaseUrl: (db) => getSetting(db, "public_webhook_base_url"),
  inspectGitHubHook: inspectGitHubHookWithOctokit,
};

export async function getWebhookAutomationHealth(
  db: Db,
  repo: Repo | null | undefined,
  dependencies: Partial<WebhookHealthDependencies> = {},
): Promise<WebhookAutomationHealth | null> {
  if (!repo) return null;
  const deps = { ...defaultDependencies, ...dependencies };
  const baseUrl = deps.getBaseUrl(db)?.trim();
  const expectedUrl = baseUrl ? buildWebhookUrl(baseUrl, repo.id) : null;

  if (!baseUrl) {
    return health({
      state: "error",
      summary: "Webhook receiver URL is not configured",
      detail: "Set Public Webhook Base URL before using automation labels.",
      recovery: "Start a tunnel, set the public webhook base URL, then rotate or reinstall this repo webhook.",
      expectedUrl,
      hookId: repo.webhookId,
    });
  }

  if (!repo.webhookId) {
    return health({
      state: "error",
      summary: "No GitHub webhook is stored for this repo",
      detail: "GitHub cannot deliver auto-launch or auto-review labels until the repo webhook exists.",
      recovery: "Open repo settings and reinstall the webhook.",
      expectedUrl,
      hookId: null,
    });
  }

  try {
    const snapshot = await deps.inspectGitHubHook(repo);
    const githubUrl = snapshot.url;
    const latestDelivery = latestDeliverySummary(snapshot.deliveries);

    if (snapshot.active === false) {
      return health({
        state: "error",
        summary: "GitHub webhook is disabled",
        detail: "Automation labels will not reach this machine while the GitHub webhook is inactive.",
        recovery: "Open repo settings and reinstall or rotate the webhook.",
        expectedUrl,
        hookId: repo.webhookId,
        githubUrl,
        latestDelivery,
      });
    }

    if (githubUrl && githubUrl !== expectedUrl) {
      return health({
        state: "error",
        summary: "GitHub webhook URL is stale",
        detail: `GitHub is delivering to ${githubUrl}, but this server expects ${expectedUrl}.`,
        recovery: `Run issuectl webhook rotate ${repo.owner}/${repo.name} --yes after starting the current tunnel.`,
        expectedUrl,
        hookId: repo.webhookId,
        githubUrl,
        latestDelivery,
      });
    }

    const latestStatusCode = latestDelivery?.statusCode ?? null;
    if (latestStatusCode !== null && latestStatusCode >= 400) {
      return health({
        state: "error",
        summary: `Recent GitHub webhook delivery failed with ${latestStatusCode}`,
        detail: "GitHub reached the configured hook but the latest delivery was not successful.",
        recovery: "Check the tunnel/server, then redeliver the event or remove and re-add the automation label.",
        expectedUrl,
        hookId: repo.webhookId,
        githubUrl,
        latestDelivery,
      });
    }

    if (!latestDelivery) {
      return health({
        state: "warning",
        summary: "GitHub webhook has no recent delivery history",
        detail: "The hook URL matches local settings, but there is no recent GitHub delivery to prove the receiver is reachable.",
        recovery: "Send a webhook ping from repo settings before relying on automation labels.",
        expectedUrl,
        hookId: repo.webhookId,
        githubUrl,
      });
    }

    return health({
      state: "ok",
      summary: "GitHub webhook delivery looks healthy",
      detail: "The GitHub hook URL matches local settings and the latest visible delivery succeeded.",
      recovery: null,
      expectedUrl,
      hookId: repo.webhookId,
      githubUrl,
      latestDelivery,
    });
  } catch (err) {
    return health({
      state: githubInspectionState(err),
      summary: githubInspectionSummary(err),
      detail: "issuectl could not inspect the GitHub webhook URL or delivery history, so automation label health is unverified.",
      recovery: "If you need live delivery checks, refresh GitHub auth with repo hook access or verify the hook in GitHub settings.",
      expectedUrl,
      hookId: repo.webhookId,
    });
  }
}

function health(input: Omit<WebhookAutomationHealth, "githubUrl" | "latestDelivery"> & Partial<Pick<WebhookAutomationHealth, "githubUrl" | "latestDelivery">>): WebhookAutomationHealth {
  return {
    githubUrl: null,
    latestDelivery: null,
    ...input,
  };
}

function latestDeliverySummary(deliveries: GitHubDelivery[]): WebhookAutomationHealth["latestDelivery"] {
  const latest = deliveries[0];
  if (!latest) return null;
  return {
    event: latest.event ?? null,
    action: latest.action ?? null,
    statusCode: typeof latest.status_code === "number" ? latest.status_code : null,
    deliveredAt: latest.delivered_at ?? null,
  };
}

function githubInspectionState(err: unknown): WebhookAutomationHealthState {
  const status = typeof err === "object" && err !== null && "status" in err
    ? (err as { status?: unknown }).status
    : undefined;
  return status === 404 ? "error" : "unknown";
}

function githubInspectionSummary(err: unknown): string {
  const status = typeof err === "object" && err !== null && "status" in err
    ? (err as { status?: unknown }).status
    : undefined;
  if (status === 404) return "Stored GitHub webhook was not found";
  if (status === 403) return "GitHub webhook health requires hook access";
  return "GitHub webhook health could not be checked";
}

async function inspectGitHubHookWithOctokit(repo: Repo): Promise<GitHubHookSnapshot> {
  return withAuthRetry(async (octokit) => {
    const { data: hook } = await octokit.rest.repos.getWebhook({
      owner: repo.owner,
      repo: repo.name,
      hook_id: repo.webhookId ?? 0,
    });
    const deliveriesResult = await octokit.rest.repos.listWebhookDeliveries({
      owner: repo.owner,
      repo: repo.name,
      hook_id: repo.webhookId ?? 0,
      per_page: 5,
    });
    return {
      active: typeof hook.active === "boolean" ? hook.active : null,
      url: typeof hook.config?.url === "string" ? hook.config.url : null,
      deliveries: deliveriesResult.data.map((delivery) => ({
        event: delivery.event,
        action: delivery.action,
        status_code: delivery.status_code,
        delivered_at: delivery.delivered_at,
      })),
    };
  });
}

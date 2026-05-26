import {
  getDb,
  getSetting,
  listRepos,
  recordDiagnosticEventSafely,
  withAuthRetry,
  type Repo,
} from "@issuectl/core";
import log from "@/lib/logger";

type Db = ReturnType<typeof getDb>;

type WebhookUrlReconcileInput = {
  owner: string;
  repo: string;
  hookId: number;
  url: string;
};

type WebhookUrlReconcileResult = {
  hookId: number;
  previousUrl: string | null;
  url: string;
  updated: boolean;
};

type ReconcileWebhookUrl = (
  input: WebhookUrlReconcileInput,
) => Promise<WebhookUrlReconcileResult>;

export type WebhookUrlReconcilerSummary = {
  checked: number;
  updated: number;
  failed: number;
  skippedReason: "missing_base_url" | "no_configured_webhooks" | null;
};

type ReconcilerDependencies = {
  getBaseUrl: (db: Db) => string | undefined;
  listConfiguredRepos: (db: Db) => Repo[];
  reconcileWebhookUrl: ReconcileWebhookUrl;
  recordDiagnostic: typeof recordDiagnosticEventSafely;
};

const defaultDependencies: ReconcilerDependencies = {
  getBaseUrl: (db) => getSetting(db, "public_webhook_base_url"),
  listConfiguredRepos: (db) => listRepos(db),
  reconcileWebhookUrl: reconcileGitHubWebhookUrl,
  recordDiagnostic: recordDiagnosticEventSafely,
};

export function buildWebhookUrl(baseUrl: string, repoId: number): string {
  return `${baseUrl.replace(/\/$/, "")}/api/webhook/github/${repoId}`;
}

export function startWebhookUrlReconciler(db: Db = getDb()): void {
  setImmediate(() => {
    reconcileWebhookUrlsOnce(db).catch((err) => {
      log.warn({ err, msg: "webhook_url_reconciler_failed" });
    });
  }).unref();
}

export async function reconcileWebhookUrlsOnce(
  db: Db,
  dependencies: Partial<ReconcilerDependencies> = {},
): Promise<WebhookUrlReconcilerSummary> {
  const deps = { ...defaultDependencies, ...dependencies };
  const baseUrl = deps.getBaseUrl(db)?.trim();
  if (!baseUrl) {
    return { checked: 0, updated: 0, failed: 0, skippedReason: "missing_base_url" };
  }

  const repos = deps.listConfiguredRepos(db).filter((repo) => repo.webhookId !== null);
  if (repos.length === 0) {
    return { checked: 0, updated: 0, failed: 0, skippedReason: "no_configured_webhooks" };
  }

  const summary: WebhookUrlReconcilerSummary = {
    checked: 0,
    updated: 0,
    failed: 0,
    skippedReason: null,
  };

  for (const repo of repos) {
    const hookId = repo.webhookId;
    if (hookId === null) continue;
    const url = buildWebhookUrl(baseUrl, repo.id);
    summary.checked += 1;
    try {
      const result = await deps.reconcileWebhookUrl({
        owner: repo.owner,
        repo: repo.name,
        hookId,
        url,
      });
      if (result.updated) {
        summary.updated += 1;
        deps.recordDiagnostic(db, {
          level: "info",
          event: "webhook.url_reconciled",
          source: "web",
          owner: repo.owner,
          repo: repo.name,
          message: "Repository webhook URL reconciled at dashboard startup",
          data: {
            repoId: repo.id,
            hookId: result.hookId,
            previousUrl: result.previousUrl,
            url: result.url,
          },
        });
      }
    } catch (err) {
      summary.failed += 1;
      log.warn({
        err,
        msg: "webhook_url_reconcile_repo_failed",
        repoId: repo.id,
        owner: repo.owner,
        repo: repo.name,
        hookId,
      });
      deps.recordDiagnostic(db, {
        level: "warn",
        event: "webhook.url_reconcile_failed",
        source: "web",
        owner: repo.owner,
        repo: repo.name,
        message: "Repository webhook URL reconciliation failed",
        data: {
          repoId: repo.id,
          hookId,
          url,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  log.info({
    msg: "webhook_url_reconciler_complete",
    checked: summary.checked,
    updated: summary.updated,
    failed: summary.failed,
  });
  return summary;
}

async function reconcileGitHubWebhookUrl(
  input: WebhookUrlReconcileInput,
): Promise<WebhookUrlReconcileResult> {
  return withAuthRetry(async (octokit) => {
    const { data: current } = await octokit.rest.repos.getWebhook({
      owner: input.owner,
      repo: input.repo,
      hook_id: input.hookId,
    });
    const previousUrl = typeof current.config?.url === "string" ? current.config.url : null;
    if (previousUrl === input.url) {
      return {
        hookId: input.hookId,
        previousUrl,
        url: input.url,
        updated: false,
      };
    }

    const { data: updated } = await octokit.rest.repos.updateWebhook({
      owner: input.owner,
      repo: input.repo,
      hook_id: input.hookId,
      config: { url: input.url },
    });
    return {
      hookId: updated.id,
      previousUrl,
      url: input.url,
      updated: true,
    };
  });
}

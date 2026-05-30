import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import { buildWebhookUrl } from "@/lib/webhook-url-reconciler";
import {
  createIssuectlWebhook,
  formatErrorForUser,
  getDb,
  getRepo,
  getRepoWebhookConfigById,
  getSetting,
  recordDiagnosticEventSafely,
  rotateIssuectlWebhook,
  updateRepoWebhookSettings,
  withAuthRetry,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

type WebhookActionBody = {
  action?: "create" | "rotate" | "reinstall" | "ping";
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo: repoName } = await params;
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;
  const action = body.action;
  if (action !== "create" && action !== "rotate" && action !== "reinstall" && action !== "ping") {
    return NextResponse.json({ success: false, error: "action must be create, rotate, reinstall, or ping" }, { status: 400 });
  }

  try {
    const db = getDb();
    const repo = getRepo(db, owner, repoName);
    if (!repo) {
      return NextResponse.json({ success: false, error: "Repository not found" }, { status: 404 });
    }
    const config = getRepoWebhookConfigById(db, repo.id);
    if (!config) {
      return NextResponse.json({ success: false, error: "Repository not found" }, { status: 404 });
    }
    if (action === "ping") {
      if (!config.webhookId) {
        return NextResponse.json({ success: false, error: "No webhook id is stored for this repo" }, { status: 400 });
      }
      await withAuthRetry((octokit) =>
        octokit.rest.repos.pingWebhook({
          owner,
          repo: repoName,
          hook_id: config.webhookId ?? 0,
        }));
      recordDiagnosticEventSafely(db, {
        level: "info",
        event: "repo.webhook_ping_sent",
        source: "web",
        owner,
        repo: repoName,
        message: "Repository webhook ping sent",
        data: { repoId: repo.id, hookId: config.webhookId },
      });
      log.info({ msg: "api_repo_webhook_ping_sent", repoId: repo.id, owner, name: repoName, hookId: config.webhookId });
      return NextResponse.json({ success: true, repo, webhook: null });
    }

    if (action === "create" && config.webhookId) {
      return NextResponse.json({ success: false, error: "Webhook already exists; rotate it instead" }, { status: 409 });
    }
    if (action === "rotate" && !config.webhookId) {
      return NextResponse.json({ success: false, error: "No webhook id is stored for this repo" }, { status: 400 });
    }

    const url = webhookUrl(db, repo.id);
    const secret = randomBytes(32).toString("hex");
    const result = await withAuthRetry(async (octokit) => {
      if (action === "create" || (action === "reinstall" && !config.webhookId)) {
        return createIssuectlWebhook(octokit, { owner, repo: repoName, url, secret });
      }
      try {
        return await rotateIssuectlWebhook(octokit, { owner, repo: repoName, hookId: config.webhookId ?? 0, url, secret });
      } catch (err) {
        if (action !== "reinstall" || (err as { status?: number }).status !== 404) throw err;
        return createIssuectlWebhook(octokit, { owner, repo: repoName, url, secret });
      }
    });
    const updated = updateRepoWebhookSettings(db, repo.id, {
      webhookId: result.id,
      webhookSecret: secret,
    });
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: action === "rotate" ? "repo.webhook_secret_rotated" : "repo.webhook_reinstalled",
      source: "web",
      owner,
      repo: repoName,
      message: action === "rotate" ? "Repository webhook secret rotated" : "Repository webhook reinstalled",
      data: { repoId: repo.id, hookId: result.id, url },
    });
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: "webhook.url_reconciled",
      source: "web",
      owner,
      repo: repoName,
      message: "Repository webhook URL reconciled",
      data: { repoId: repo.id, hookId: result.id, url },
    });

    log.info({
      msg: "api_repo_webhook_configured",
      repoId: repo.id,
      owner,
      name: repoName,
      action,
      hookId: result.id,
      createdBy: result.createdBy,
    });
    return NextResponse.json({
      success: true,
      repo: updated,
      webhook: {
        id: result.id,
        url,
        createdBy: result.createdBy,
      },
    });
  } catch (err) {
    log.error({ err, msg: "api_repo_webhook_configure_failed", owner, name: repoName, action });
    return NextResponse.json({ success: false, error: formatErrorForUser(err) }, { status: 500 });
  }
}

async function readBody(request: NextRequest): Promise<WebhookActionBody | NextResponse> {
  try {
    return await request.json() as WebhookActionBody;
  } catch (err) {
    log.warn({ err, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}

function webhookUrl(db: ReturnType<typeof getDb>, repoId: number): string {
  const baseUrl = getSetting(db, "public_webhook_base_url");
  if (!baseUrl) throw new Error("public_webhook_base_url is not configured.");
  return buildWebhookUrl(baseUrl, repoId);
}

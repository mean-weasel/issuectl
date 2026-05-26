import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  listRepos,
  getRepo,
  formatErrorForUser,
} from "@issuectl/core";
import { addRepo as addRepoAction } from "@/lib/actions/repos";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const db = getDb();
    const repos = listRepos(db);
    return NextResponse.json({ repos });
  } catch (err) {
    log.error({ err, msg: "api_repos_list_failed" });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

const OWNER_REPO_RE = /^[a-zA-Z0-9._-]+$/;

type AddRepoBody = {
  owner: string;
  name: string;
  localPath?: string;
  autoLaunchIssues?: boolean;
  autoReviewPrs?: boolean;
  issueAgent?: "claude" | "codex";
  reviewAgent?: "claude" | "codex";
  reviewPreamble?: string | null;
  webhookPayloadMode?: "metadata" | "raw";
  installWebhook?: boolean;
  firstPingTimeoutMs?: number;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  let body: AddRepoBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.owner !== "string" || !body.owner.trim()) {
    return NextResponse.json({ error: "Owner is required" }, { status: 400 });
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Repo name is required" }, { status: 400 });
  }
  if (!OWNER_REPO_RE.test(body.owner) || !OWNER_REPO_RE.test(body.name)) {
    return NextResponse.json({ error: "Invalid owner/repo format" }, { status: 400 });
  }
  if (body.localPath !== undefined && typeof body.localPath !== "string") {
    return NextResponse.json({ error: "localPath must be a string" }, { status: 400 });
  }
  if (body.autoLaunchIssues !== undefined && typeof body.autoLaunchIssues !== "boolean") {
    return NextResponse.json({ error: "autoLaunchIssues must be a boolean" }, { status: 400 });
  }
  if (body.autoReviewPrs !== undefined && typeof body.autoReviewPrs !== "boolean") {
    return NextResponse.json({ error: "autoReviewPrs must be a boolean" }, { status: 400 });
  }
  if (body.issueAgent !== undefined && body.issueAgent !== "claude" && body.issueAgent !== "codex") {
    return NextResponse.json({ error: "issueAgent must be claude or codex" }, { status: 400 });
  }
  if (body.reviewAgent !== undefined && body.reviewAgent !== "claude" && body.reviewAgent !== "codex") {
    return NextResponse.json({ error: "reviewAgent must be claude or codex" }, { status: 400 });
  }
  if (
    body.reviewPreamble !== undefined &&
    body.reviewPreamble !== null &&
    typeof body.reviewPreamble !== "string"
  ) {
    return NextResponse.json({ error: "reviewPreamble must be a string or null" }, { status: 400 });
  }
  if (body.webhookPayloadMode !== undefined && body.webhookPayloadMode !== "metadata" && body.webhookPayloadMode !== "raw") {
    return NextResponse.json({ error: "webhookPayloadMode must be metadata or raw" }, { status: 400 });
  }
  if (body.installWebhook !== undefined && typeof body.installWebhook !== "boolean") {
    return NextResponse.json({ error: "installWebhook must be a boolean" }, { status: 400 });
  }
  if (
    body.firstPingTimeoutMs !== undefined &&
    (!Number.isInteger(body.firstPingTimeoutMs) || body.firstPingTimeoutMs < 0)
  ) {
    return NextResponse.json({ error: "firstPingTimeoutMs must be a non-negative integer" }, { status: 400 });
  }

  try {
    const result = await addRepoAction(body.owner, body.name, body.localPath, {
      autoLaunchIssues: body.autoLaunchIssues,
      autoReviewPrs: body.autoReviewPrs,
      issueAgent: body.issueAgent,
      reviewAgent: body.reviewAgent,
      reviewPreamble: body.reviewPreamble,
      webhookPayloadMode: body.webhookPayloadMode,
      installWebhook: body.installWebhook,
      firstPingTimeoutMs: body.firstPingTimeoutMs,
    });
    if (!result.success) {
      const status = result.error === "Repository already tracked"
        ? 409
        : result.error.includes("not found on GitHub")
          ? 404
          : 500;
      return NextResponse.json(
        { success: false, error: result.error },
        { status },
      );
    }

    const db = getDb();
    const repo = getRepo(db, body.owner, body.name) ?? result.addedRepo;
    log.info({ msg: "api_repo_added", repoId: result.addedRepo.id, owner: body.owner, name: body.name });
    return NextResponse.json({
      success: true,
      repo,
      addedRepo: result.addedRepo,
      install: result.install,
      ...(result.warning ? { warning: result.warning } : {}),
      ...(result.cacheStale ? { cacheStale: true as const } : {}),
    });
  } catch (err) {
    log.error({ err, msg: "api_repo_add_failed" });
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

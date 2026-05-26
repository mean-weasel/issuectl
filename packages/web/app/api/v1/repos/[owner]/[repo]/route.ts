import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  getActiveWebhookDeploymentsForRepoTarget,
  markActivePrReviewForDeploymentTerminal,
  killTtyd,
  killTmuxSession,
  recordDiagnosticEventSafely,
  tmuxSessionName,
  updateRepo,
  updateRepoWebhookSettings,
  formatErrorForUser,
} from "@issuectl/core";
import { notifyDeploymentTerminalOutcome } from "@/lib/push/notifications";
import { removeRepo as removeRepoAction } from "@/lib/actions/repos";

export const dynamic = "force-dynamic";

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo: repoName } = await params;
  if (!owner || !repoName) {
    return NextResponse.json(
      { success: false, error: "Owner and repo name are required" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    const repo = getRepo(db, owner, repoName);
    if (!repo) {
      return NextResponse.json(
        { success: false, error: "Repository not found" },
        { status: 404 },
      );
    }

    const result = await removeRepoAction(repo.id);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error ?? "Failed to remove repository" },
        { status: 500 },
      );
    }
    log.info({ msg: "api_repo_removed", repoId: repo.id, owner, name: repoName });
    return NextResponse.json({ success: true, ...(result.cacheStale ? { cacheStale: true as const } : {}) });
  } catch (err) {
    log.error({ err, msg: "api_repo_remove_failed", owner, name: repoName });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

type UpdateRepoBody = {
  localPath?: string;
  branchPattern?: string;
  autoLaunchIssues?: boolean;
  autoReviewPrs?: boolean;
  issueAgent?: "claude" | "codex";
  reviewAgent?: "claude" | "codex";
  reviewPreamble?: string | null;
  webhookPayloadMode?: "metadata" | "raw";
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo: repoName } = await params;
  if (!owner || !repoName) {
    return NextResponse.json(
      { success: false, error: "Owner and repo name are required" },
      { status: 400 },
    );
  }

  let body: UpdateRepoBody;
  try {
    body = await request.json();
  } catch (parseErr) {
    log.warn({ err: parseErr, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (body.localPath !== undefined && typeof body.localPath !== "string") {
    return NextResponse.json(
      { success: false, error: "localPath must be a string" },
      { status: 400 },
    );
  }
  if (body.branchPattern !== undefined && typeof body.branchPattern !== "string") {
    return NextResponse.json(
      { success: false, error: "branchPattern must be a string" },
      { status: 400 },
    );
  }
  if (body.autoLaunchIssues !== undefined && typeof body.autoLaunchIssues !== "boolean") {
    return NextResponse.json({ success: false, error: "autoLaunchIssues must be a boolean" }, { status: 400 });
  }
  if (body.autoReviewPrs !== undefined && typeof body.autoReviewPrs !== "boolean") {
    return NextResponse.json({ success: false, error: "autoReviewPrs must be a boolean" }, { status: 400 });
  }
  if (body.issueAgent !== undefined && body.issueAgent !== "claude" && body.issueAgent !== "codex") {
    return NextResponse.json({ success: false, error: "issueAgent must be claude or codex" }, { status: 400 });
  }
  if (body.reviewAgent !== undefined && body.reviewAgent !== "claude" && body.reviewAgent !== "codex") {
    return NextResponse.json({ success: false, error: "reviewAgent must be claude or codex" }, { status: 400 });
  }
  if (
    body.reviewPreamble !== undefined &&
    body.reviewPreamble !== null &&
    typeof body.reviewPreamble !== "string"
  ) {
    return NextResponse.json({ success: false, error: "reviewPreamble must be a string or null" }, { status: 400 });
  }
  if (body.webhookPayloadMode !== undefined && body.webhookPayloadMode !== "metadata" && body.webhookPayloadMode !== "raw") {
    return NextResponse.json({ success: false, error: "webhookPayloadMode must be metadata or raw" }, { status: 400 });
  }

  try {
    const db = getDb();
    const repo = getRepo(db, owner, repoName);
    if (!repo) {
      return NextResponse.json(
        { success: false, error: "Repository not found" },
        { status: 404 },
      );
    }

    const updates: { localPath?: string | null; branchPattern?: string | null } = {};
    if (body.localPath !== undefined) updates.localPath = body.localPath || null;
    if (body.branchPattern !== undefined) updates.branchPattern = body.branchPattern || null;

    let updated = updateRepo(db, repo.id, updates);
    const webhookUpdates = {
      autoLaunchIssues: body.autoLaunchIssues,
      autoReviewPrs: body.autoReviewPrs,
      issueAgent: body.issueAgent,
      reviewAgent: body.reviewAgent,
      reviewPreamble: body.reviewPreamble,
      webhookPayloadMode: body.webhookPayloadMode,
    };
    if (Object.values(webhookUpdates).some((value) => value !== undefined)) {
      updated = updateRepoWebhookSettings(db, repo.id, webhookUpdates);
      const endedSessionIds = endDisabledAutomationSessions(db, repo, webhookUpdates);
      recordAutomationDiagnostics(db, repo, webhookUpdates, endedSessionIds);
    }
    log.info({ msg: "api_repo_updated", repoId: repo.id, owner, name: repoName, updates, webhookUpdates });
    return NextResponse.json({ success: true, repo: updated });
  } catch (err) {
    log.error({ err, msg: "api_repo_update_failed", owner, name: repoName });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

function recordAutomationDiagnostics(
  db: ReturnType<typeof getDb>,
  repo: { id: number; owner: string; name: string },
  updates: { autoLaunchIssues?: boolean; autoReviewPrs?: boolean },
  affectedSessionIds: { issue: number[]; pr: number[] } = { issue: [], pr: [] },
): void {
  if (updates.autoLaunchIssues === true || updates.autoReviewPrs === true) {
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: "repo.automation_enabled",
      source: "web",
      owner: repo.owner,
      repo: repo.name,
      message: "Repository webhook automation enabled",
      data: { repoId: repo.id, autoLaunchIssues: updates.autoLaunchIssues, autoReviewPrs: updates.autoReviewPrs, affectedSessionIds },
    });
  }
  if (updates.autoLaunchIssues === false || updates.autoReviewPrs === false) {
    recordDiagnosticEventSafely(db, {
      level: "warn",
      event: "repo.automation_disabled",
      source: "web",
      owner: repo.owner,
      repo: repo.name,
      message: "Repository webhook automation disabled",
      data: { repoId: repo.id, autoLaunchIssues: updates.autoLaunchIssues, autoReviewPrs: updates.autoReviewPrs, affectedSessionIds },
    });
  }
}

function endDisabledAutomationSessions(
  db: ReturnType<typeof getDb>,
  repo: { id: number; name: string; autoLaunchIssues: boolean; autoReviewPrs: boolean },
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
  db: ReturnType<typeof getDb>,
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
    notifyDeploymentTerminalOutcome({ deploymentId: deployment.id });
    endedSessionIds.push(deployment.id);
  }
  return endedSessionIds;
}

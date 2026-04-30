import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  getRepo,
  getDeploymentById,
  endDeployment,
  killTtyd,
  tmuxSessionName,
  cleanupStaleContextFiles,
  removeLabel,
  LIFECYCLE_LABEL,
  clearCacheKey,
  withAuthRetry,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

type EndSessionBody = {
  owner: string;
  repo: string;
  issueNumber: number;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { id: idStr } = await params;
  const deploymentId = parseInt(idStr, 10);
  if (Number.isNaN(deploymentId) || deploymentId <= 0) {
    return NextResponse.json({ error: "Invalid deployment ID" }, { status: 400 });
  }

  let body: EndSessionBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.owner || !body.repo) {
    return NextResponse.json({ error: "Invalid repository reference" }, { status: 400 });
  }
  if (!Number.isInteger(body.issueNumber) || body.issueNumber <= 0) {
    return NextResponse.json({ error: "Invalid issue number" }, { status: 400 });
  }

  try {
    const db = getDb();
    const deployment = getDeploymentById(db, deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const repoRecord = getRepo(db, body.owner, body.repo);
    if (!repoRecord) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }

    if (deployment.repoId !== repoRecord.id || deployment.issueNumber !== body.issueNumber) {
      return NextResponse.json({ error: "Deployment does not match the specified issue" }, { status: 400 });
    }

    if (deployment.endedAt !== null) {
      return NextResponse.json({ success: true });
    }

    if (deployment.ttydPid) {
      try {
        killTtyd(deployment.ttydPid, tmuxSessionName(body.repo, body.issueNumber));
      } catch (killErr) {
        log.warn({ err: killErr, msg: "kill_ttyd_failed", deploymentId, pid: deployment.ttydPid });
      }
    }
    endDeployment(db, deploymentId);

    try {
      await withAuthRetry((octokit) =>
        removeLabel(
          octokit,
          body.owner,
          body.repo,
          body.issueNumber,
          LIFECYCLE_LABEL.inProgress,
        ),
      );
      clearCacheKey(db, `issue-detail:${body.owner}/${body.repo}#${body.issueNumber}`);
      clearCacheKey(db, `issue-header:${body.owner}/${body.repo}#${body.issueNumber}`);
      clearCacheKey(db, `issue-content:${body.owner}/${body.repo}#${body.issueNumber}`);
      clearCacheKey(db, `issues:${body.owner}/${body.repo}`);
    } catch (labelErr) {
      log.warn({
        err: labelErr,
        msg: "in_progress_label_cleanup_failed",
        deploymentId,
        owner: body.owner,
        repo: body.repo,
        issueNumber: body.issueNumber,
      });
    }

    cleanupStaleContextFiles().catch((cleanupErr) => {
      log.warn({ err: cleanupErr, msg: "context_file_cleanup_failed" });
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_end_session_failed", deploymentId });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

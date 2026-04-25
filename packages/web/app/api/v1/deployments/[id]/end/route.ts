import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  getDb,
  getRepo,
  getDeploymentById,
  endDeployment,
  killTtyd,
  tmuxSessionName,
  formatErrorForUser,
  cleanupStaleContextFiles,
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

    if (deployment.ttydPid) {
      try {
        killTtyd(deployment.ttydPid, tmuxSessionName(body.repo, body.issueNumber));
      } catch (killErr) {
        console.warn(
          "[issuectl] Failed to kill ttyd process, proceeding with session end:",
          { deploymentId, pid: deployment.ttydPid },
          killErr,
        );
      }
    }
    endDeployment(db, deploymentId);

    cleanupStaleContextFiles().catch((err) => {
      console.warn("[issuectl] Failed to clean up stale context files:", err);
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[issuectl] POST /api/v1/deployments/${deploymentId}/end failed:`, err);
    return NextResponse.json({ error: formatErrorForUser(err) }, { status: 500 });
  }
}

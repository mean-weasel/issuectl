import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import {
  getDb,
  getRepo,
  executeLaunch,
  withAuthRetry,
  withIdempotency,
  DuplicateInFlightError,
  formatErrorForUser,
  type WorkspaceMode,
} from "@issuectl/core";
import { VALID_BRANCH_RE, MAX_PREAMBLE } from "@/lib/constants";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

type LaunchRequestBody = {
  branchName: string;
  workspaceMode: WorkspaceMode;
  selectedCommentIndices: number[];
  selectedFilePaths: string[];
  preamble?: string;
  forceResume?: boolean;
};

const VALID_WORKSPACE_MODES: WorkspaceMode[] = [
  "existing",
  "worktree",
  "clone",
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string; number: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo, number: numStr } = await params;
  const issueNumber = parseInt(numStr, 10);
  if (Number.isNaN(issueNumber) || issueNumber <= 0) {
    return NextResponse.json({ error: "Invalid issue number" }, { status: 400 });
  }

  let body: LaunchRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const trimmedBranch = (body.branchName ?? "").trim();
  if (!trimmedBranch) {
    return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
  }
  if (!VALID_BRANCH_RE.test(trimmedBranch)) {
    return NextResponse.json({ error: "Branch name contains invalid characters" }, { status: 400 });
  }
  if (!VALID_WORKSPACE_MODES.includes(body.workspaceMode)) {
    return NextResponse.json({ error: "Invalid workspace mode" }, { status: 400 });
  }
  if (!Array.isArray(body.selectedCommentIndices) ||
      body.selectedCommentIndices.some((i) => !Number.isInteger(i) || i < 0)) {
    return NextResponse.json({ error: "Invalid comment selection" }, { status: 400 });
  }
  if (!Array.isArray(body.selectedFilePaths)) {
    return NextResponse.json({ error: "Invalid file paths" }, { status: 400 });
  }
  for (const filePath of body.selectedFilePaths) {
    if (typeof filePath !== "string" || filePath.length === 0) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }
    if (filePath.includes("\0") || filePath.startsWith("/") || filePath.includes("..")) {
      return NextResponse.json({ error: "File paths must be relative without '..' or null bytes" }, { status: 400 });
    }
  }
  if (body.preamble && body.preamble.length > MAX_PREAMBLE) {
    return NextResponse.json(
      { error: `Preamble must be ${MAX_PREAMBLE} characters or fewer` },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const idempotencyKey = randomUUID();
    const runLaunch = async () => {
      const r = await withAuthRetry((octokit) =>
        executeLaunch(db, octokit, {
          owner,
          repo,
          issueNumber,
          branchName: trimmedBranch,
          workspaceMode: body.workspaceMode,
          selectedComments: body.selectedCommentIndices,
          selectedFiles: body.selectedFilePaths,
          preamble: body.preamble || undefined,
          forceResume: body.forceResume,
        }),
      );
      return {
        deploymentId: r.deploymentId,
        ttydPort: r.ttydPort,
        labelWarning: r.labelWarning ?? null,
      };
    };
    const result = await withIdempotency(db, "launch-issue", idempotencyKey, runLaunch);

    return NextResponse.json({
      success: true,
      deploymentId: result.deploymentId,
      ttydPort: result.ttydPort,
      ...(result.labelWarning ? { labelWarning: result.labelWarning } : {}),
    });
  } catch (err) {
    if (err instanceof DuplicateInFlightError) {
      return NextResponse.json(
        { error: "This launch is already in progress — please wait." },
        { status: 409 },
      );
    }
    console.error(`[issuectl] POST /api/v1/launch/${owner}/${repo}/${issueNumber} failed:`, err);
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

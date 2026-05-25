import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  ensureLifecycleLabels,
  formatErrorForUser,
  getDb,
  getRepo,
  listLabels,
  recordDiagnosticEventSafely,
  withAuthRetry,
} from "@issuectl/core";

export const dynamic = "force-dynamic";

const AUTOMATION_LABELS = [
  {
    name: "issuectl:auto-launch",
    color: "2f81f7",
    description: "Opt issue into issuectl auto-launch",
  },
  {
    name: "issuectl:auto-review",
    color: "a371f7",
    description: "Opt PR into issuectl auto-review",
  },
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo } = await params;

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }

    const labels = await withAuthRetry((octokit) =>
      listLabels(octokit, owner, repo),
    );
    log.info({ msg: "api_labels_listed", owner, repo, count: labels.length });
    return NextResponse.json({ labels });
  } catch (err) {
    log.error({ err, msg: "api_labels_list_failed", owner, repo });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  const { owner, repo } = await params;
  const body = await readBody(request);
  if (body instanceof NextResponse) return body;
  if (body.action !== "recreate") {
    return NextResponse.json({ error: "action must be recreate" }, { status: 400 });
  }

  try {
    const db = getDb();
    if (!getRepo(db, owner, repo)) {
      return NextResponse.json({ error: "Repository not tracked" }, { status: 404 });
    }
    await withAuthRetry(async (octokit) => {
      await ensureLifecycleLabels(octokit, owner, repo);
      await ensureAutomationLabels(octokit, owner, repo);
    });
    recordDiagnosticEventSafely(db, {
      level: "info",
      event: "repo.label_recreated",
      source: "web",
      owner,
      repo,
      message: "Repository automation labels recreated",
    });
    log.info({ msg: "api_labels_recreated", owner, repo });
    return NextResponse.json({ success: true });
  } catch (err) {
    log.error({ err, msg: "api_labels_recreate_failed", owner, repo });
    return NextResponse.json(
      { error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

async function ensureAutomationLabels(
  octokit: Parameters<typeof ensureLifecycleLabels>[0],
  owner: string,
  repo: string,
): Promise<void> {
  await Promise.all(AUTOMATION_LABELS.map(async (label) => {
    try {
      await octokit.rest.issues.getLabel({ owner, repo, name: label.name });
    } catch (err) {
      if ((err as { status?: number }).status !== 404) throw err;
      await octokit.rest.issues.createLabel({
        owner,
        repo,
        name: label.name,
        color: label.color,
        description: label.description,
      });
    }
  }));
}

async function readBody(request: NextRequest): Promise<{ action?: string } | NextResponse> {
  try {
    return await request.json() as { action?: string };
  } catch (err) {
    log.warn({ err, msg: "api_request_body_parse_failed", url: request.nextUrl.pathname });
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}

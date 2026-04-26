import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import log from "@/lib/logger";
import {
  getDb,
  listRepos,
  addRepo,
  getRepo,
  formatErrorForUser,
  withAuthRetry,
} from "@issuectl/core";

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

  // Verify the repo exists on GitHub
  try {
    await withAuthRetry((octokit) =>
      octokit.rest.repos.get({ owner: body.owner, repo: body.name }),
    );
  } catch (err) {
    log.warn({ err, msg: "api_repo_add_github_check_failed", owner: body.owner, name: body.name });
    return NextResponse.json(
      { error: `Repository ${body.owner}/${body.name} not found on GitHub` },
      { status: 404 },
    );
  }

  try {
    const db = getDb();

    // Check for duplicates
    const existing = getRepo(db, body.owner, body.name);
    if (existing) {
      return NextResponse.json(
        { error: "Repository already tracked" },
        { status: 409 },
      );
    }

    const repo = addRepo(db, { owner: body.owner, name: body.name });
    log.info({ msg: "api_repo_added", repoId: repo.id, owner: body.owner, name: body.name });
    return NextResponse.json({ success: true, repo });
  } catch (err) {
    log.error({ err, msg: "api_repo_add_failed" });
    return NextResponse.json(
      { success: false, error: formatErrorForUser(err) },
      { status: 500 },
    );
  }
}

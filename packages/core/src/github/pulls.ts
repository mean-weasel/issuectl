import type { Octokit } from "@octokit/rest";
import type { GitHubPull, GitHubCheck, GitHubPullFile, GitHubPullReview, GitHubComment, RawGitHubUser } from "./types.js";
import { mapUser } from "./types.js";
import { matchLinkedPRs } from "../lifecycle/detect.js";

function mapPull(raw: unknown): GitHubPull {
  const r = raw as {
    number: number;
    title: string;
    body: string | null;
    state: string;
    draft: boolean;
    merged: boolean;
    merged_at: string | null;
    user: RawGitHubUser;
    head: { ref: string };
    base: { ref: string };
    additions: number;
    deletions: number;
    changed_files: number;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    html_url: string;
  };
  return {
    number: r.number,
    title: r.title,
    body: r.body,
    state: r.state as GitHubPull["state"],
    draft: r.draft ?? false,
    merged: r.merged ?? r.merged_at !== null,
    user: mapUser(r.user),
    headRef: r.head.ref,
    baseRef: r.base.ref,
    additions: r.additions ?? 0,
    deletions: r.deletions ?? 0,
    changedFiles: r.changed_files ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    mergedAt: r.merged_at ?? null,
    closedAt: r.closed_at,
    htmlUrl: r.html_url,
  };
}

export async function listPulls(
  octokit: Octokit,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all",
): Promise<GitHubPull[]> {
  const items = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state,
    per_page: 100,
  });
  return items.map((item) => mapPull(item));
}

export async function getPull(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubPull> {
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
  });
  return mapPull(data);
}

export async function getPullChecks(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<GitHubCheck[]> {
  const { data } = await octokit.rest.checks.listForRef({
    owner,
    repo,
    ref,
  });
  return data.check_runs.map((run) => ({
    name: run.name,
    status: run.status as GitHubCheck["status"],
    conclusion: (run.conclusion as GitHubCheck["conclusion"]) ?? null,
    startedAt: run.started_at ?? null,
    completedAt: run.completed_at ?? null,
    htmlUrl: run.html_url ?? null,
  }));
}

export type ChecksRollupStatus = "success" | "failure" | "pending" | null;

/**
 * Returns a single rollup status for a given ref by inspecting check runs.
 * - "failure" if any check has conclusion failure/cancelled/timed_out
 * - "pending" if any check is not yet completed
 * - "success" if all checks completed with success/neutral/skipped
 * - null if there are no checks
 */
export async function getChecksRollupForRef(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<ChecksRollupStatus> {
  const { data } = await octokit.rest.checks.listForRef({
    owner,
    repo,
    ref,
    per_page: 100,
  });

  const runs = data.check_runs;
  if (runs.length === 0) return null;

  let hasPending = false;
  for (const run of runs) {
    if (run.status !== "completed") {
      hasPending = true;
      continue;
    }
    const c = run.conclusion;
    if (c === "failure" || c === "cancelled" || c === "timed_out" || c === "action_required") {
      return "failure";
    }
  }

  return hasPending ? "pending" : "success";
}

export async function listPullFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubPullFile[]> {
  const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number: number,
    per_page: 100,
  });
  return files.map((f) => ({
    filename: f.filename,
    status: f.status as GitHubPullFile["status"],
    additions: f.additions,
    deletions: f.deletions,
  }));
}

export async function findLinkedPRs(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  prefetchedPulls?: GitHubPull[],
): Promise<GitHubPull[]> {
  const pulls = prefetchedPulls ?? await listPulls(octokit, owner, repo, "all");
  return matchLinkedPRs(pulls, issueNumber);
}

export async function listReviews(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubPullReview[]> {
  const { data } = await octokit.rest.pulls.listReviews({
    owner,
    repo,
    pull_number: number,
  });
  return data.map((r) => ({
    id: r.id,
    user: mapUser(r.user as RawGitHubUser),
    state: r.state.toLowerCase() as GitHubPullReview["state"],
    body: r.body ?? "",
    submittedAt: r.submitted_at ?? null,
  }));
}

export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

export async function createReview(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  event: ReviewEvent,
  body?: string,
): Promise<GitHubPullReview> {
  const { data } = await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: number,
    event,
    body: body || undefined,
  });
  return {
    id: data.id,
    user: mapUser(data.user as RawGitHubUser),
    state: data.state.toLowerCase() as GitHubPullReview["state"],
    body: data.body ?? "",
    submittedAt: data.submitted_at ?? null,
  };
}

export type MergeMethod = "merge" | "squash" | "rebase";

export async function mergePull(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  mergeMethod: MergeMethod,
): Promise<{ sha: string; merged: boolean; message: string }> {
  const { data } = await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: number,
    merge_method: mergeMethod,
  });
  return { sha: data.sha, merged: data.merged, message: data.message };
}

export async function createPullComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  body: string,
): Promise<GitHubComment> {
  const { data } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: number,
    body,
  });
  return {
    id: data.id,
    body: data.body ?? "",
    user: mapUser(data.user as RawGitHubUser),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    htmlUrl: data.html_url,
  };
}

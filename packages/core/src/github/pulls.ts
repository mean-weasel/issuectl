import type { Octokit } from "@octokit/rest";
import type { GitHubPull, GitHubCheck, GitHubPullFile, RawGitHubUser } from "./types.js";
import { mapUser } from "./types.js";
import { matchLinkedPRs } from "../lifecycle/detect.js";

function mapPull(raw: unknown): GitHubPull {
  const r = raw as {
    number: number;
    title: string;
    body: string | null;
    state: string;
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

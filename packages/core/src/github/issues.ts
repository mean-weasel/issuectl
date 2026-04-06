import type { Octokit } from "@octokit/rest";
import type { GitHubIssue, GitHubComment, RawGitHubUser } from "./types.js";
import { mapUser } from "./types.js";

function mapIssue(raw: unknown): GitHubIssue {
  const r = raw as {
    number: number;
    title: string;
    body: string | null;
    state: string;
    labels: Array<{ name?: string; color?: string; description?: string | null } | string>;
    user: RawGitHubUser;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    html_url: string;
  };
  return {
    number: r.number,
    title: r.title,
    body: r.body,
    state: r.state as GitHubIssue["state"],
    labels: r.labels
      .filter((l): l is { name?: string; color?: string; description?: string | null } => typeof l !== "string")
      .map((l) => ({
        name: l.name ?? "",
        color: l.color ?? "",
        description: l.description ?? null,
      })),
    user: mapUser(r.user),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    closedAt: r.closed_at,
    htmlUrl: r.html_url,
  };
}

function mapComment(raw: unknown): GitHubComment {
  const r = raw as {
    id: number;
    body: string;
    user: RawGitHubUser;
    created_at: string;
    updated_at: string;
    html_url: string;
  };
  return {
    id: r.id,
    body: r.body ?? "",
    user: mapUser(r.user),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    htmlUrl: r.html_url,
  };
}

export async function listIssues(
  octokit: Octokit,
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open",
): Promise<GitHubIssue[]> {
  const items = await octokit.paginate(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state,
    per_page: 100,
  });
  // GitHub API returns PRs in the issues endpoint — filter them out
  return items
    .filter((item) => !("pull_request" in item && item.pull_request))
    .map((item) => mapIssue(item));
}

export async function getIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubIssue> {
  const { data } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: number,
  });
  return mapIssue(data);
}

export async function createIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  data: { title: string; body?: string; labels?: string[] },
): Promise<GitHubIssue> {
  const { data: created } = await octokit.rest.issues.create({
    owner,
    repo,
    title: data.title,
    body: data.body,
    labels: data.labels,
  });
  return mapIssue(created);
}

export async function updateIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
  data: { title?: string; body?: string; labels?: string[] },
): Promise<GitHubIssue> {
  const { data: updated } = await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: number,
    ...data,
  });
  return mapIssue(updated);
}

export async function closeIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<void> {
  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: number,
    state: "closed",
  });
}

export async function getComments(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<GitHubComment[]> {
  const items = await octokit.paginate(
    octokit.rest.issues.listComments,
    { owner, repo, issue_number: number, per_page: 100 },
  );
  return items.map((item) => mapComment(item));
}

export async function addComment(
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
  return mapComment(data);
}

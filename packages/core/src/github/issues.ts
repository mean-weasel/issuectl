import type { Octokit } from "@octokit/rest";
import type Database from "better-sqlite3";
import type { GitHubIssue, GitHubComment, RawGitHubUser } from "./types.js";
import { mapUser } from "./types.js";
import { getRepoById } from "../db/repos.js";
import { clearCacheKey } from "../db/cache.js";
import { deletePriority, getPriority, setPriority } from "../db/priority.js";

function mapIssue(raw: unknown): GitHubIssue {
  const r = raw as {
    number: number;
    title: string;
    body: string | null;
    state: string;
    labels: Array<{ name?: string; color?: string; description?: string | null } | string>;
    user: RawGitHubUser;
    comments: number;
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
    commentCount: r.comments ?? 0,
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

export type ReassignResult = {
  newIssueNumber: number;
  newIssueUrl: string;
  newOwner: string;
  newRepo: string;
  /** Set when the new issue was created but old-issue cleanup failed. */
  cleanupWarning?: string;
};

/**
 * Re-assigns an issue from one repo to another by:
 * 1. Fetching the issue from the old repo
 * 2. Creating it on the new repo (preserving title and body)
 * 3. Closing the old issue with a cross-reference comment
 * 4. Migrating the local priority to the new repo/issue
 * 5. Invalidating relevant caches
 */
export async function reassignIssue(
  db: Database.Database,
  octokit: Octokit,
  oldRepoId: number,
  issueNumber: number,
  newRepoId: number,
): Promise<ReassignResult> {
  if (oldRepoId === newRepoId) {
    throw new Error("Cannot re-assign an issue to the same repo");
  }

  const oldRepo = getRepoById(db, oldRepoId);
  if (!oldRepo) throw new Error(`Old repo (id ${oldRepoId}) not found`);

  const newRepo = getRepoById(db, newRepoId);
  if (!newRepo) throw new Error(`New repo (id ${newRepoId}) not found`);

  // 1. Fetch the existing issue
  const oldIssue = await getIssue(octokit, oldRepo.owner, oldRepo.name, issueNumber);

  // 2. Create the issue on the new repo
  const newIssue = await createIssue(octokit, newRepo.owner, newRepo.name, {
    title: oldIssue.title,
    body: oldIssue.body ?? undefined,
  });

  // 3. Close the old issue with a cross-reference comment.
  // After the new issue exists, cleanup of the old issue is best-effort:
  // if it fails, we still return the result so the caller (and the
  // idempotency layer) record the new issue — preventing duplicates on
  // retry.
  let cleanupWarning: string | undefined;
  try {
    const crossRef = `Moved to ${newRepo.owner}/${newRepo.name}#${newIssue.number}`;
    await addComment(octokit, oldRepo.owner, oldRepo.name, issueNumber, crossRef);
    await closeIssue(octokit, oldRepo.owner, oldRepo.name, issueNumber);
  } catch (cleanupErr) {
    console.warn(
      `[issuectl] reassignIssue: new issue created (${newRepo.owner}/${newRepo.name}#${newIssue.number}) but old issue cleanup failed`,
      cleanupErr,
    );
    cleanupWarning = `Issue moved but #${issueNumber} could not be closed: ${cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr)}`;
  }

  // 4. Migrate local priority (local-only, safe to do even on cleanup failure)
  const oldPriority = getPriority(db, oldRepoId, issueNumber);
  db.transaction(() => {
    setPriority(db, newRepoId, newIssue.number, oldPriority);
    deletePriority(db, oldRepoId, issueNumber);
  })();

  // 5. Invalidate caches
  clearCacheKey(db, `issues:${oldRepo.owner}/${oldRepo.name}`);
  clearCacheKey(db, `issue-detail:${oldRepo.owner}/${oldRepo.name}#${issueNumber}`);
  clearCacheKey(db, `issue-header:${oldRepo.owner}/${oldRepo.name}#${issueNumber}`);
  clearCacheKey(db, `issue-content:${oldRepo.owner}/${oldRepo.name}#${issueNumber}`);
  clearCacheKey(db, `issues:${newRepo.owner}/${newRepo.name}`);

  return {
    newIssueNumber: newIssue.number,
    newIssueUrl: newIssue.htmlUrl,
    newOwner: newRepo.owner,
    newRepo: newRepo.name,
    cleanupWarning,
  };
}

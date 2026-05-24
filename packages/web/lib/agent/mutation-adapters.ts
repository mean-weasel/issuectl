import {
  addLabel,
  createIssue,
  createPullComment,
  getCurrentBranch,
  getHeadSha,
  getRemoteUrl,
  removeLabel,
  withAuthRetry,
} from "@issuectl/core";
import type { AgentMutationAdapters, PullForSafety } from "./mutation-types";

export const defaultAgentMutationAdapters: AgentMutationAdapters = {
  comment: async ({ owner, repo, targetNumber, body }) => {
    await withAuthRetry((octokit) => createPullComment(octokit, owner, repo, targetNumber, body));
  },
  label: async ({ owner, repo, targetNumber, label, operation }) => {
    await withAuthRetry((octokit) => (
      operation === "remove"
        ? removeLabel(octokit, owner, repo, targetNumber, label)
        : addLabel(octokit, owner, repo, targetNumber, label)
    ));
  },
  createIssue: async ({ owner, repo, title, body }) => {
    await withAuthRetry((octokit) => createIssue(octokit, owner, repo, { title, body }));
  },
  createPr: async ({ owner, repo, title, head, base, body }) => {
    await withAuthRetry((octokit) =>
      octokit.rest.pulls.create({ owner, repo, title, head, base, body }),
    );
  },
  fetchPull: async ({ owner, repo, targetNumber }) => {
    const { data } = await withAuthRetry((octokit) =>
      octokit.rest.pulls.get({ owner, repo, pull_number: targetNumber }),
    );
    return mapPullForSafety(data);
  },
  isBranchProtected: async ({ owner, repo, branch }) => {
    const { data } = await withAuthRetry((octokit) =>
      octokit.rest.repos.getBranch({ owner, repo, branch }),
    );
    return Boolean(data.protected);
  },
  verifyWorkspaceHead: async ({ workspacePath, expectedHeadRef, expectedHeadSha, owner, repo }) => {
    const [branch, sha, remoteUrl] = await Promise.all([
      getCurrentBranch(workspacePath),
      getHeadSha(workspacePath),
      getRemoteUrl(workspacePath, "origin"),
    ]);
    if (branch !== expectedHeadRef) return { ok: false, reason: "unsafe_checkout" };
    if (sha !== expectedHeadSha) return { ok: false, reason: "unsafe_checkout" };
    if (!remoteMatchesRepo(remoteUrl, owner, repo)) return { ok: false, reason: "unsafe_checkout" };
    return { ok: true };
  },
  push: async ({ owner, repo, ref, sha }) => {
    await withAuthRetry((octokit) =>
      octokit.rest.git.updateRef({ owner, repo, ref, sha, force: false }),
    );
  },
};

function remoteMatchesRepo(remoteUrl: string, owner: string, repo: string): boolean {
  const expected = `${owner}/${repo}`.toLowerCase();
  const normalized = remoteUrl
    .trim()
    .replace(/\.git$/i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^https:\/\/github\.com\//i, "")
    .replace(/^ssh:\/\/git@github\.com\//i, "")
    .toLowerCase();
  return normalized === expected;
}

function mapPullForSafety(raw: unknown): PullForSafety {
  const pull = raw as {
    number: number;
    title: string;
    body: string | null;
    state: string;
    draft?: boolean;
    merged?: boolean;
    merged_at?: string | null;
    user?: { login: string; avatar_url: string } | null;
    head: { ref: string; sha: string; repo: { full_name: string } | null };
    base: { ref: string; sha: string; repo: { full_name: string; default_branch?: string } | null };
    additions?: number;
    deletions?: number;
    changed_files?: number;
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    html_url: string;
  };
  return {
    number: pull.number,
    title: pull.title,
    body: pull.body,
    state: pull.state as PullForSafety["state"],
    draft: pull.draft ?? false,
    merged: pull.merged ?? pull.merged_at !== null,
    user: pull.user ? { login: pull.user.login, avatarUrl: pull.user.avatar_url } : null,
    headRef: pull.head.ref,
    baseRef: pull.base.ref,
    defaultBranch: pull.base.repo?.default_branch,
    headSha: pull.head.sha,
    baseSha: pull.base.sha,
    headRepoFullName: pull.head.repo?.full_name ?? "",
    baseRepoFullName: pull.base.repo?.full_name ?? "",
    additions: pull.additions ?? 0,
    deletions: pull.deletions ?? 0,
    changedFiles: pull.changed_files ?? 0,
    createdAt: pull.created_at,
    updatedAt: pull.updated_at,
    mergedAt: pull.merged_at ?? null,
    closedAt: pull.closed_at,
    htmlUrl: pull.html_url,
  };
}

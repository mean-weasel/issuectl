import type { GitHubPull, UnifiedList } from "@issuectl/core";
import { repoKey } from "./repo-key";

export type PrEntry = {
  repo: { owner: string; name: string };
  pull: GitHubPull;
};

/**
 * Validate a raw `?repo=` URL parameter against the user's tracked repos.
 * Returns the param verbatim if it matches a real repo, null otherwise —
 * this prevents stray or outdated repo keys in the URL from producing an
 * empty filtered view with no indication that the filter was rejected.
 */
export function resolveActiveRepo(
  param: string | undefined,
  repos: readonly { owner: string; name: string }[],
): string | null {
  if (!param) return null;
  const exists = repos.some((r) => repoKey(r) === param);
  return exists ? param : null;
}

/**
 * Filter a unified list to a single repo. Drafts (`unassigned`) are dropped
 * entirely when a repo filter is active because drafts have no repo.
 */
export function filterUnifiedList(
  data: UnifiedList,
  activeRepo: string | null,
): UnifiedList {
  if (!activeRepo) return data;
  const match = (item: { repo: { owner: string; name: string } }) =>
    repoKey(item.repo) === activeRepo;
  return {
    unassigned: [],
    in_focus: data.in_focus.filter(match),
    in_flight: data.in_flight.filter(match),
    shipped: data.shipped.filter(match),
  };
}

/**
 * Filter PRs by repo AND by author. Passing `username === null` skips the
 * author filter (used when the user isn't signed in OR when "everyone" is
 * selected).
 */
export function filterPrs(
  prs: readonly PrEntry[],
  activeRepo: string | null,
  username: string | null,
): PrEntry[] {
  return prs.filter(({ repo, pull }) => {
    if (activeRepo && repoKey(repo) !== activeRepo) return false;
    if (username && pull.user?.login !== username) return false;
    return true;
  });
}

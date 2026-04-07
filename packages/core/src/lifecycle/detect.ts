import type { GitHubPull } from "../github/types.js";

const CLOSING_PATTERN =
  /(?:closes|fixes|resolves)\s+(?:[\w.-]+\/[\w.-]+)?#(\d+)/gi;

/**
 * Filters a pre-fetched PR list for PRs that reference the given issue
 * via GitHub closing keywords (Closes #N, Fixes #N, Resolves #N).
 * Only scans PR body text; does not check titles or commit messages.
 *
 * `findLinkedPRs` in the GitHub layer wraps this with a full paginated
 * PR fetch — use this function directly when you already have the list.
 */
export function matchLinkedPRs(
  pulls: GitHubPull[],
  issueNumber: number,
): GitHubPull[] {
  return pulls.filter((pr) => {
    if (!pr.body) return false;
    for (const match of pr.body.matchAll(CLOSING_PATTERN)) {
      if (Number(match[1]) === issueNumber) return true;
    }
    return false;
  });
}

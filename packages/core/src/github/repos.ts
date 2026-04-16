import type { Octokit } from "@octokit/rest";
import type { GitHubAccessibleRepo } from "./types.js";

const PAGE_SIZE = 100;

export async function listAccessibleRepos(
  octokit: Octokit,
): Promise<GitHubAccessibleRepo[]> {
  // Single page cap. 100 most recently pushed repos covers almost all real
  // use cases; the picker has a manual-entry fallback for the long tail.
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    per_page: PAGE_SIZE,
    sort: "pushed",
    affiliation: "owner,collaborator,organization_member",
  });
  if (data.length === PAGE_SIZE) {
    // Possible truncation: the user has 100+ accessible repos. Without
    // surfacing this, older repos silently disappear from the picker each
    // refresh. Log so operators see the signal and the picker can route it
    // to a subtle UI hint later if needed.
    console.warn(
      `[issuectl] listAccessibleRepos returned ${PAGE_SIZE} repos — result may be truncated. ` +
        "The picker's manual-entry fallback covers repos beyond the first page.",
    );
  }
  return data.map((item) => ({
    owner: item.owner.login,
    name: item.name,
    private: item.private,
    pushedAt: item.pushed_at ?? null,
  }));
}

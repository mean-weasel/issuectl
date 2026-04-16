import { describe, it, expect, vi } from "vitest";
import type { Octokit } from "@octokit/rest";
import { listAccessibleRepos } from "./repos.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFn = ReturnType<typeof vi.fn<(...args: any[]) => any>>;

function makeOctokit() {
  const listForAuthenticatedUser = vi.fn() as MockFn;
  const octokit = {
    rest: {
      repos: { listForAuthenticatedUser },
    },
  } as unknown as Octokit;
  return { octokit, listForAuthenticatedUser };
}

describe("listAccessibleRepos", () => {
  it("maps Octokit response to GitHubAccessibleRepo shape", async () => {
    const { octokit, listForAuthenticatedUser } = makeOctokit();
    listForAuthenticatedUser.mockResolvedValue({
      data: [
        {
          owner: { login: "mean-weasel" },
          name: "seatify",
          private: false,
          pushed_at: "2026-04-10T12:00:00Z",
        },
        {
          owner: { login: "acme-co" },
          name: "billing-api",
          private: true,
          pushed_at: null,
        },
      ],
    });

    const repos = await listAccessibleRepos(octokit);
    expect(repos).toEqual([
      {
        owner: "mean-weasel",
        name: "seatify",
        private: false,
        pushedAt: "2026-04-10T12:00:00Z",
      },
      {
        owner: "acme-co",
        name: "billing-api",
        private: true,
        pushedAt: null,
      },
    ]);
  });

  it("requests one page of 100, sorted by pushed, all affiliations", async () => {
    const { octokit, listForAuthenticatedUser } = makeOctokit();
    listForAuthenticatedUser.mockResolvedValue({ data: [] });
    await listAccessibleRepos(octokit);
    expect(listForAuthenticatedUser).toHaveBeenCalledWith({
      per_page: 100,
      sort: "pushed",
      affiliation: "owner,collaborator,organization_member",
    });
  });
});

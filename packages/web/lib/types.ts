import type { Repo } from "@issuectl/core";

export type RepoOption = { owner: string; repo: string };

export type RepoWithStats = Repo & {
  issueCount: number;
  prCount: number;
  deployedCount: number;
  labels: Array<{ name: string; count: number }>;
  oldestIssueAge: number;
};

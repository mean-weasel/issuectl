import type { Repo } from "@issuectl/core";

export type RepoWithStats = Repo & {
  issueCount: number;
  prCount: number;
  deployedCount: number;
  labels: Array<{ name: string; count: number }>;
  oldestIssueAge: number;
};

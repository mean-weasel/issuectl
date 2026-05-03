import type { Repo } from "@issuectl/core";
import type { RepoOption } from "@/lib/types";

export function parseDefaultRepoId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getDefaultRepoOption(
  repos: Repo[],
  defaultRepoId: number | null,
): RepoOption {
  const repo =
    defaultRepoId !== null
      ? repos.find((candidate) => candidate.id === defaultRepoId)
      : undefined;
  const selected = repo ?? repos[0];
  return { owner: selected.owner, repo: selected.name };
}

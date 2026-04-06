import type { Octokit } from "@octokit/rest";
import type { GitHubLabel } from "./types.js";

export const LIFECYCLE_LABEL = {
  deployed: "issuectl:deployed",
  prOpen: "issuectl:pr-open",
  done: "issuectl:done",
} as const;

const LIFECYCLE_LABELS = [
  {
    name: LIFECYCLE_LABEL.deployed,
    color: "d29922",
    description: "Launched to Claude Code via issuectl",
  },
  {
    name: LIFECYCLE_LABEL.prOpen,
    color: "58a6ff",
    description: "PR referencing this issue is open",
  },
  {
    name: LIFECYCLE_LABEL.done,
    color: "3fb950",
    description: "PR merged and issue closed",
  },
];

function isNotFound(err: unknown): boolean {
  return (err as { status?: number }).status === 404;
}

export async function ensureLifecycleLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<void> {
  await Promise.all(
    LIFECYCLE_LABELS.map(async (label) => {
      try {
        await octokit.rest.issues.getLabel({ owner, repo, name: label.name });
      } catch (err) {
        if (!isNotFound(err)) throw err;
        await octokit.rest.issues.createLabel({
          owner,
          repo,
          name: label.name,
          color: label.color,
          description: label.description,
        });
      }
    }),
  );
}

export async function listLabels(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<GitHubLabel[]> {
  const items = await octokit.paginate(octokit.rest.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100,
  });
  return items.map((item) => ({
    name: item.name,
    color: item.color ?? "",
    description: item.description ?? null,
  }));
}

export async function addLabel(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  label: string,
): Promise<void> {
  await octokit.rest.issues.addLabels({
    owner,
    repo,
    issue_number: issueNumber,
    labels: [label],
  });
}

export async function removeLabel(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  label: string,
): Promise<void> {
  try {
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number: issueNumber,
      name: label,
    });
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

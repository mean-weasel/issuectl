export type RepoWithLabels = {
  owner: string;
  name: string;
  labels: string[];
};

export function formatRepoContext(repos: RepoWithLabels[]): string {
  if (repos.length === 0) {
    return "## Connected Repositories\n\nNo repositories are connected. All parsed issues will need manual repo assignment.\n";
  }

  const sections = ["## Connected Repositories\n"];

  for (const repo of repos) {
    sections.push(`### ${repo.owner}/${repo.name}`);
    sections.push(`- Owner: ${repo.owner}`);
    sections.push(`- Repo: ${repo.name}`);
    if (repo.labels.length > 0) {
      sections.push(`- Available labels: ${repo.labels.join(", ")}`);
    } else {
      sections.push("- Available labels: (none)");
    }
    sections.push("");
  }

  return sections.join("\n");
}

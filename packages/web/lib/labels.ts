import type { GitHubLabel } from "@issuectl/core";

export function isLifecycleLabel(name: string): boolean {
  return name.startsWith("issuectl:");
}

export function separateLabels(labels: GitHubLabel[]): {
  lifecycle: GitHubLabel[];
  regular: GitHubLabel[];
} {
  const lifecycle: GitHubLabel[] = [];
  const regular: GitHubLabel[] = [];
  for (const l of labels) {
    if (isLifecycleLabel(l.name)) {
      lifecycle.push(l);
    } else {
      regular.push(l);
    }
  }
  return { lifecycle, regular };
}

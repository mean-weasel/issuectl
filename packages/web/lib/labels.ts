import type { GitHubLabel } from "@issuectl/core";

const SELECTABLE_ISSUECTL_LABELS = new Set(["issuectl:auto-launch"]);

export function isLifecycleLabel(name: string): boolean {
  return name.startsWith("issuectl:");
}

export function isSelectableIssueLabel(name: string): boolean {
  return !isLifecycleLabel(name) || SELECTABLE_ISSUECTL_LABELS.has(name);
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

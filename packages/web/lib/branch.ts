/**
 * Generate a branch name from a pattern, issue number, and title.
 * Mirrors the logic in @issuectl/core but lives in the web package
 * so it can be used in client components without pulling in Node.js deps.
 */
export function generateBranchName(
  pattern: string,
  issueNumber: number,
  issueTitle: string,
): string {
  const slug =
    issueTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50)
      .replace(/-$/, "") || "untitled";

  return pattern
    .replace("{number}", String(issueNumber))
    .replace("{slug}", slug);
}

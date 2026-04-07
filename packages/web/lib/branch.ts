/**
 * Duplicated from @issuectl/core/launch/branch.ts because that module
 * imports Node.js built-ins (child_process, util) unavailable in client
 * components. If the core version changes, this must be updated to match.
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

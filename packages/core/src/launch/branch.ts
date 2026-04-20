import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

export async function branchExists(
  repoPath: string,
  branchName: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      "git",
      ["rev-parse", "--verify", `refs/heads/${branchName}`],
      { cwd: repoPath, timeout: 10_000 },
    );
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const stderr = (err as { stderr?: string }).stderr ?? "";
    if (code === "ENOENT" || stderr.includes("not a git repository")) {
      throw err;
    }
    return false;
  }
}

export async function createOrCheckoutBranch(
  repoPath: string,
  branchName: string,
  baseBranch?: string,
): Promise<void> {
  const exists = await branchExists(repoPath, branchName);
  if (exists) {
    await execFileAsync("git", ["checkout", branchName], { cwd: repoPath, timeout: 10_000 });
  } else {
    const args = ["checkout", "-b", branchName];
    if (baseBranch) args.push(baseBranch);
    await execFileAsync("git", args, { cwd: repoPath, timeout: 10_000 });
  }
}

export async function isWorkingTreeClean(repoPath: string): Promise<boolean> {
  const { stdout } = await execFileAsync(
    "git",
    ["status", "--porcelain"],
    { cwd: repoPath, timeout: 10_000 },
  );
  return stdout.trim() === "";
}

export async function getDefaultBranch(repoPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["symbolic-ref", "refs/remotes/origin/HEAD", "--short"],
      { cwd: repoPath, timeout: 10_000 },
    );
    return stdout.trim();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const stderr = (err as { stderr?: string }).stderr ?? "";
    if (code === "ENOENT" || stderr.includes("not a git repository")) {
      throw err;
    }
    console.warn("[issuectl] Could not detect default branch, falling back to origin/main");
    return "origin/main";
  }
}

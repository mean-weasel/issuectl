import type { GitHubPull } from "./types.js";

type PullBranchSafety = Pick<GitHubPull, "headRef" | "headSha" | "headRepoFullName" | "baseRepoFullName">;

export type AutoReviewPrSafetyOptions = {
  baseRepoFullName: string;
  defaultBranch: string;
  desiredHeadSha?: string | null;
  headProtected: boolean;
};

export function isSameRepoPr(pull: GitHubPull, baseRepoFullName: string): boolean {
  return pull.headRepoFullName === baseRepoFullName && pull.baseRepoFullName === baseRepoFullName;
}

export function isForkPr(pull: GitHubPull, baseRepoFullName: string): boolean {
  return !isSameRepoPr(pull, baseRepoFullName);
}

export function isNonDefaultBranch(pull: GitHubPull, defaultBranch: string): boolean {
  return pull.headRef !== defaultBranch;
}

export function isUnprotectedBranch(pull: GitHubPull, protectedBranches: Iterable<string>): boolean {
  return !new Set(protectedBranches).has(pull.headRef);
}

export function headRefMatches(
  pull: GitHubPull,
  expected: { headRef: string; headSha?: string | null },
): boolean {
  return pull.headRef === expected.headRef
    && (expected.headSha === undefined || expected.headSha === null || pull.headSha === expected.headSha);
}

export function isSafeAutoReviewPrHead(
  pull: PullBranchSafety,
  options: AutoReviewPrSafetyOptions,
): boolean {
  return pull.headRepoFullName === options.baseRepoFullName
    && pull.baseRepoFullName === options.baseRepoFullName
    && pull.headRef !== options.defaultBranch
    && !options.headProtected
    && (options.desiredHeadSha === undefined || options.desiredHeadSha === null || pull.headSha === options.desiredHeadSha);
}

import { describe, expect, it } from "vitest";
import type { GitHubPull } from "./types.js";
import {
  headRefMatches,
  isForkPr,
  isNonDefaultBranch,
  isSameRepoPr,
  isUnprotectedBranch,
} from "./pr-safety.js";

function pull(overrides: Partial<GitHubPull> = {}): GitHubPull {
  return {
    number: 506,
    title: "Webhook reviews",
    body: null,
    state: "open",
    draft: false,
    merged: false,
    user: null,
    headRef: "feature/webhooks",
    baseRef: "main",
    headSha: "abc123",
    baseSha: "def456",
    headRepoFullName: "mean-weasel/issuectl",
    baseRepoFullName: "mean-weasel/issuectl",
    additions: 10,
    deletions: 2,
    changedFiles: 3,
    createdAt: "2026-05-23T00:00:00Z",
    updatedAt: "2026-05-23T00:00:00Z",
    mergedAt: null,
    closedAt: null,
    htmlUrl: "https://github.com/mean-weasel/issuectl/pull/506",
    ...overrides,
  };
}

describe("PR auto-review safety predicates", () => {
  it("requires the PR head repo to be the base repo", () => {
    expect(isSameRepoPr(pull(), "mean-weasel/issuectl")).toBe(true);
    expect(isSameRepoPr(pull({ headRepoFullName: "fork/issuectl" }), "mean-weasel/issuectl")).toBe(false);
    expect(isForkPr(pull({ headRepoFullName: "fork/issuectl" }), "mean-weasel/issuectl")).toBe(true);
  });

  it("rejects default and protected branches", () => {
    expect(isNonDefaultBranch(pull(), "main")).toBe(true);
    expect(isNonDefaultBranch(pull({ headRef: "main" }), "main")).toBe(false);
    expect(isUnprotectedBranch(pull(), ["main", "release"])).toBe(true);
    expect(isUnprotectedBranch(pull({ headRef: "release" }), ["main", "release"])).toBe(false);
  });

  it("verifies the final head ref and SHA immediately before mutation", () => {
    expect(headRefMatches(pull(), { headRef: "feature/webhooks", headSha: "abc123" })).toBe(true);
    expect(headRefMatches(pull(), { headRef: "feature/webhooks", headSha: "moved" })).toBe(false);
    expect(headRefMatches(pull(), { headRef: "renamed", headSha: "abc123" })).toBe(false);
  });
});

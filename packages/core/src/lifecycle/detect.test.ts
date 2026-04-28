import { describe, it, expect } from "vitest";
import type { GitHubPull } from "../github/types.js";
import { matchLinkedPRs } from "./detect.js";

function makePR(overrides: Partial<GitHubPull> = {}): GitHubPull {
  return {
    number: 10,
    title: "Some PR",
    body: null,
    state: "open",
    draft: false,
    merged: false,
    user: null,
    headRef: "feature",
    baseRef: "main",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    mergedAt: null,
    closedAt: null,
    htmlUrl: "https://github.com/owner/repo/pull/10",
    ...overrides,
  };
}

describe("matchLinkedPRs", () => {
  it("matches PR body containing 'closes #N'", () => {
    const pulls = [makePR({ body: "This closes #5" })];
    const result = matchLinkedPRs(pulls, 5);
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(10);
  });

  it("matches PR body containing 'fixes #N'", () => {
    const pulls = [makePR({ body: "This fixes #5" })];
    const result = matchLinkedPRs(pulls, 5);
    expect(result).toHaveLength(1);
  });

  it("matches PR body containing 'resolves #N'", () => {
    const pulls = [makePR({ body: "This resolves #5" })];
    const result = matchLinkedPRs(pulls, 5);
    expect(result).toHaveLength(1);
  });

  it("matches case-insensitively (CLOSES #5)", () => {
    const pulls = [makePR({ body: "CLOSES #5" })];
    const result = matchLinkedPRs(pulls, 5);
    expect(result).toHaveLength(1);
  });

  it("excludes PRs with no closing keyword", () => {
    const pulls = [makePR({ body: "This references #5 but does not close it" })];
    const result = matchLinkedPRs(pulls, 5);
    expect(result).toHaveLength(0);
  });

  it("excludes PRs with closing keyword for a different issue number", () => {
    const pulls = [makePR({ body: "closes #99" })];
    const result = matchLinkedPRs(pulls, 5);
    expect(result).toHaveLength(0);
  });

  it("excludes PRs with null or empty body", () => {
    const pulls = [makePR({ body: null }), makePR({ body: "" })];
    const result = matchLinkedPRs(pulls, 5);
    expect(result).toHaveLength(0);
  });

  it("matches cross-repo closing keyword (owner/repo#N)", () => {
    const pulls = [makePR({ body: "fixes owner/repo#5" })];
    const result = matchLinkedPRs(pulls, 5);
    expect(result).toHaveLength(1);
  });
});

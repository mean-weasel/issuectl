import { describe, it, expect } from "vitest";
import type { GitHubPull, UnifiedList } from "@issuectl/core";
import {
  resolveActiveRepo,
  filterUnifiedList,
  filterPrs,
  type PrEntry,
} from "./page-filters";

const trackedRepos = [
  { owner: "acme", name: "alpha" },
  { owner: "acme", name: "beta" },
];

describe("resolveActiveRepo", () => {
  it("returns null when no param", () => {
    expect(resolveActiveRepo(undefined, trackedRepos)).toBeNull();
  });

  it("returns null when param matches no tracked repo", () => {
    expect(resolveActiveRepo("other/repo", trackedRepos)).toBeNull();
  });

  it("returns the param when it matches a tracked repo", () => {
    expect(resolveActiveRepo("acme/alpha", trackedRepos)).toBe("acme/alpha");
  });
});

function makeUnifiedList(): UnifiedList {
  const alpha = {
    id: 1,
    owner: "acme",
    name: "alpha",
    localPath: null,
    branchPattern: null,
    createdAt: "2026-01-01",
  };
  const beta = {
    id: 2,
    owner: "acme",
    name: "beta",
    localPath: null,
    branchPattern: null,
    createdAt: "2026-01-01",
  };
  const issueItem = (repo: typeof alpha, number: number) => ({
    kind: "issue" as const,
    repo,
    issue: {
      number,
      title: `Issue ${number}`,
      body: null,
      state: "open" as const,
      labels: [],
      user: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      closedAt: null,
      htmlUrl: "",
    },
    priority: "normal" as const,
    section: "open" as const,
  });
  return {
    unassigned: [
      {
        kind: "draft",
        draft: {
          id: "d1",
          title: "draft 1",
          body: "",
          priority: "normal",
          createdAt: 0,
          updatedAt: 0,
        },
      },
    ],
    open: [issueItem(alpha, 1), issueItem(beta, 2)],
    running: [],
    closed: [],
  };
}

describe("filterUnifiedList", () => {
  it("returns input unchanged when no repo filter", () => {
    const list = makeUnifiedList();
    expect(filterUnifiedList(list, null)).toBe(list);
  });

  it("drops drafts when a repo filter is active", () => {
    const list = makeUnifiedList();
    const filtered = filterUnifiedList(list, "acme/alpha");
    expect(filtered.unassigned).toEqual([]);
  });

  it("keeps only items matching the active repo", () => {
    const list = makeUnifiedList();
    const filtered = filterUnifiedList(list, "acme/alpha");
    expect(filtered.open).toHaveLength(1);
    expect(filtered.open[0].repo.name).toBe("alpha");
  });
});

function makePull(overrides: Partial<GitHubPull> = {}): GitHubPull {
  return {
    number: 1,
    title: "PR",
    body: null,
    state: "open",
    merged: false,
    user: { login: "me", avatarUrl: "" },
    headRef: "f",
    baseRef: "main",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    createdAt: "",
    updatedAt: "",
    mergedAt: null,
    closedAt: null,
    htmlUrl: "",
    ...overrides,
  };
}

describe("filterPrs", () => {
  const entries: PrEntry[] = [
    { repo: { owner: "acme", name: "alpha" }, pull: makePull({ number: 1, user: { login: "me", avatarUrl: "" } }) },
    { repo: { owner: "acme", name: "beta" }, pull: makePull({ number: 2, user: { login: "other", avatarUrl: "" } }) },
    { repo: { owner: "acme", name: "alpha" }, pull: makePull({ number: 3, user: null }) },
  ];

  it("no filters returns all", () => {
    expect(filterPrs(entries, null, null)).toHaveLength(3);
  });

  it("filters by repo", () => {
    const result = filterPrs(entries, "acme/alpha", null);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.repo.name === "alpha")).toBe(true);
  });

  it("filters by author (mine)", () => {
    const result = filterPrs(entries, null, "me");
    expect(result.map((e) => e.pull.number)).toEqual([1]);
  });

  it("composes repo + author as AND (not OR)", () => {
    const result = filterPrs(entries, "acme/beta", "me");
    // alpha#1 is mine but wrong repo; beta#2 is right repo but not mine.
    expect(result).toEqual([]);
  });

  it("hides null-user PRs when author filter is active", () => {
    const result = filterPrs(entries, null, "me");
    expect(result.find((e) => e.pull.user === null)).toBeUndefined();
  });
});

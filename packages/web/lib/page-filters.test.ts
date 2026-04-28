import { describe, it, expect } from "vitest";
import type { PullWithChecksStatus } from "@issuectl/core";
import {
  resolveActiveRepo,
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

function makePull(overrides: Partial<PullWithChecksStatus> = {}): PullWithChecksStatus {
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
    checksStatus: null,
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

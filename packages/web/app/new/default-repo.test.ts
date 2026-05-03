import { describe, expect, it } from "vitest";
import type { Repo } from "@issuectl/core";
import { getDefaultRepoOption, parseDefaultRepoId } from "./default-repo";

const repos: Repo[] = [
  {
    id: 2,
    owner: "acme",
    name: "second",
    localPath: null,
    branchPattern: null,
    createdAt: "2026-01-02 00:00:00",
  },
  {
    id: 1,
    owner: "acme",
    name: "first",
    localPath: null,
    branchPattern: null,
    createdAt: "2026-01-01 00:00:00",
  },
];

describe("new issue default repo selection", () => {
  it("uses the stored repo id when it matches a tracked repo", () => {
    expect(getDefaultRepoOption(repos, 1)).toEqual({
      owner: "acme",
      repo: "first",
    });
  });

  it("falls back to the first repo when the stored id is missing", () => {
    expect(getDefaultRepoOption(repos, 999)).toEqual({
      owner: "acme",
      repo: "second",
    });
  });

  it("parses only positive integer default repo ids", () => {
    expect(parseDefaultRepoId("42")).toBe(42);
    expect(parseDefaultRepoId("")).toBeNull();
    expect(parseDefaultRepoId("1.5")).toBeNull();
    expect(parseDefaultRepoId("-1")).toBeNull();
    expect(parseDefaultRepoId(undefined)).toBeNull();
  });
});

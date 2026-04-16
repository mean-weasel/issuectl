import { describe, it, expect } from "vitest";
import { buildHref } from "./list-href";

describe("buildHref", () => {
  it("no params → /", () => {
    expect(buildHref({})).toBe("/");
  });

  it("tab=issues is the default and is omitted", () => {
    expect(buildHref({ tab: "issues" })).toBe("/");
  });

  it("tab=prs is serialized", () => {
    expect(buildHref({ tab: "prs" })).toBe("/?tab=prs");
  });

  it("section=in_focus is the default and is omitted", () => {
    expect(buildHref({ section: "in_focus" })).toBe("/");
  });

  it("non-default sections are serialized", () => {
    expect(buildHref({ section: "shipped" })).toBe("/?section=shipped");
    expect(buildHref({ section: "in_flight" })).toBe("/?section=in_flight");
    expect(buildHref({ section: "unassigned" })).toBe("/?section=unassigned");
  });

  it("mine=true → mine=1; mine=null and false are omitted", () => {
    expect(buildHref({ tab: "prs", mine: true })).toBe("/?tab=prs&mine=1");
    expect(buildHref({ tab: "prs", mine: null })).toBe("/?tab=prs");
    expect(buildHref({ tab: "prs", mine: false })).toBe("/?tab=prs");
  });

  it("repo is passed through verbatim when non-empty", () => {
    expect(buildHref({ repo: "acme/alpha" })).toBe("/?repo=acme%2Falpha");
  });

  it("repo=null is omitted", () => {
    expect(buildHref({ repo: null })).toBe("/");
  });

  it("composes all four params correctly", () => {
    // `buildHref` is a dumb URL serializer — callers are responsible for
    // gating `section` off on the PR tab. When they do pass a non-default
    // section alongside other params, it gets serialized.
    expect(
      buildHref({
        tab: "prs",
        repo: "acme/alpha",
        mine: true,
        section: "shipped",
      }),
    ).toBe("/?tab=prs&repo=acme%2Falpha&mine=1&section=shipped");
  });
});
